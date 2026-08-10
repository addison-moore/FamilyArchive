import { getEnv } from "@familyarchive/config";
import { redisConnectionOptions } from "@familyarchive/shared";
import Redis from "ioredis";

/**
 * Attempt limiting for the unauthenticated write paths.
 *
 * Without it the credentials callback will verify passwords forever, and each
 * attempt costs a bcryptjs hash at cost 12 — so an unauthenticated caller can
 * both stuff credentials indefinitely and burn CPU doing it.
 *
 * A fixed window, not a sliding one: `INCR` plus an `EXPIRE` on the first
 * increment is a single round trip on the common path, and the worst case — up
 * to 2x the limit across a window boundary — does not matter for this purpose.
 *
 * Counters live in Valkey, which is already a hard dependency (BullMQ needs
 * it). They are lost on a Valkey restart, which is acceptable: the window is
 * minutes, and losing them fails in the permissive direction.
 */

export interface RateLimitRule {
  /** Attempts permitted per window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. 0 when allowed. */
  retryAfterSeconds: number;
}

const ALLOWED: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

let client: Redis | undefined;

function getClient(): Redis {
  if (!client) {
    client = new Redis({
      ...redisConnectionOptions(getEnv().REDIS_URL),
      // The limiter sits on the sign-in path: a stalled connection must fail
      // fast to the fail-open branch rather than hold the request open.
      enableOfflineQueue: false,
      commandTimeout: 1_000,
      lazyConnect: false,
    });
    // Without a listener a connection error is an unhandled 'error' event,
    // which would take the process down rather than degrading the limiter.
    client.on("error", () => {});
  }
  return client;
}

/**
 * Count one attempt against `key`.
 *
 * Fails **open**: if Valkey is unreachable the attempt is allowed. A
 * self-hosted instance that has lost Valkey should not also lose the ability to
 * sign in — and with the worker down too, it is already degraded.
 */
export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  try {
    const redis = getClient();
    const namespaced = `ratelimit:${key}`;
    const count = await redis.incr(namespaced);
    if (count === 1) {
      await redis.expire(namespaced, rule.windowSeconds);
      return ALLOWED;
    }
    if (count <= rule.limit) return ALLOWED;
    const ttl = await redis.ttl(namespaced);
    return {
      allowed: false,
      // -1 (no expiry) and -2 (missing) should not happen after an INCR, but
      // reporting the whole window is better than reporting "retry now".
      retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    };
  } catch {
    return ALLOWED;
  }
}

/** Forget an identifier's attempts — called when a sign-in finally succeeds. */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await getClient().del(`ratelimit:${key}`);
  } catch {
    // Best effort: a stale counter expires on its own.
  }
}

/** Close the client so a worker or test run can exit cleanly. */
export async function closeRateLimiter(): Promise<void> {
  if (!client) return;
  const closing = client;
  client = undefined;
  await closing.quit().catch(() => closing.disconnect());
}

/**
 * The client address to limit on.
 *
 * `X-Forwarded-For` is only honoured when the operator sets
 * TRUST_PROXY_HEADERS, because the header is trivially spoofed by anyone
 * talking to the app directly — and the inverse mistake is worse: behind a
 * reverse proxy every request shares one source address, so a single attacker
 * would lock out the entire instance. The identifier limit is the real defense;
 * this is a looser second bound.
 */
export function clientIp(headers: Headers): string {
  if (getEnv().TRUST_PROXY_HEADERS) {
    const forwarded = headers.get("x-forwarded-for");
    // Left-most entry is the original client; the rest are proxies.
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "unknown";
}

/** Windows are deliberately short: this throttles, it does not lock accounts out. */
export const SIGN_IN_PER_EMAIL: RateLimitRule = { limit: 10, windowSeconds: 15 * 60 };
export const SIGN_IN_PER_IP: RateLimitRule = { limit: 50, windowSeconds: 15 * 60 };
export const RESET_PER_EMAIL: RateLimitRule = { limit: 5, windowSeconds: 15 * 60 };
export const RESET_PER_IP: RateLimitRule = { limit: 20, windowSeconds: 15 * 60 };
export const REGISTER_PER_IP: RateLimitRule = { limit: 10, windowSeconds: 60 * 60 };

/** "in about 3 minutes" — for the message shown to a throttled user. */
export function describeRetryAfter(seconds: number): string {
  if (seconds <= 60) return "in less than a minute";
  const minutes = Math.ceil(seconds / 60);
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
