import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The limiter reads TRUST_PROXY_HEADERS through the cached env, so each case
 * sets the variable and re-imports the module with a fresh registry.
 */
async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("./rate-limit");
}

const REQUIRED = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

afterEach(() => {
  delete process.env.TRUST_PROXY_HEADERS;
});

describe("clientIp", () => {
  it("ignores proxy headers unless the operator opts in", async () => {
    // The default has to be "ignore": the header is trivially spoofed by
    // anyone reaching the app directly.
    const { clientIp } = await loadWith({ ...REQUIRED, TRUST_PROXY_HEADERS: undefined });
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9" });
    expect(clientIp(headers)).toBe("unknown");
  });

  it("takes the left-most forwarded entry when trust is enabled", async () => {
    const { clientIp } = await loadWith({ ...REQUIRED, TRUST_PROXY_HEADERS: "true" });
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.7, 10.0.0.1" });
    expect(clientIp(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then to unknown", async () => {
    const { clientIp } = await loadWith({ ...REQUIRED, TRUST_PROXY_HEADERS: "true" });
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
    // An empty header must not become an empty-string key shared by everyone.
    expect(clientIp(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});

describe("describeRetryAfter", () => {
  it("rounds up to whole minutes and singularizes correctly", async () => {
    const { describeRetryAfter } = await loadWith(REQUIRED);
    expect(describeRetryAfter(1)).toBe("in less than a minute");
    expect(describeRetryAfter(60)).toBe("in less than a minute");
    expect(describeRetryAfter(61)).toBe("in about 2 minutes");
    expect(describeRetryAfter(90)).toBe("in about 2 minutes");
    expect(describeRetryAfter(15 * 60)).toBe("in about 15 minutes");
  });
});

describe("consumeRateLimit", () => {
  it("allows the attempt when Valkey is unreachable", async () => {
    // Fail open: an instance that lost Valkey must not also lose sign-in.
    const { consumeRateLimit } = await loadWith({
      ...REQUIRED,
      REDIS_URL: "redis://127.0.0.1:1",
    });
    const result = await consumeRateLimit("test:unreachable", { limit: 1, windowSeconds: 60 });
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });
});

describe("rule constants", () => {
  it("limit the identifier more tightly than the address", async () => {
    const mod = await loadWith(REQUIRED);
    // The per-email bound is the real defense; the per-IP bound is looser
    // because a shared address may legitimately carry many users.
    expect(mod.SIGN_IN_PER_EMAIL.limit).toBeLessThan(mod.SIGN_IN_PER_IP.limit);
    expect(mod.RESET_PER_EMAIL.limit).toBeLessThan(mod.RESET_PER_IP.limit);
    for (const rule of [
      mod.SIGN_IN_PER_EMAIL,
      mod.SIGN_IN_PER_IP,
      mod.RESET_PER_EMAIL,
      mod.RESET_PER_IP,
      mod.REGISTER_PER_IP,
    ]) {
      expect(rule.limit).toBeGreaterThan(0);
      expect(rule.windowSeconds).toBeGreaterThan(0);
    }
  });
});
