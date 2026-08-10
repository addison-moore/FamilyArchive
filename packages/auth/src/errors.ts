import { AuthError, CredentialsSignin } from "next-auth";

/**
 * Thrown by the credentials callback when the attempt limit is reached.
 *
 * Extends CredentialsSignin so Auth.js treats it as an ordinary sign-in
 * failure — the redirect flow stays intact — while `code` lets the login page
 * tell "too many attempts" apart from "wrong password". The wait is carried in
 * the code rather than the message because Auth.js only propagates the code.
 */
export class RateLimitedError extends CredentialsSignin {
  code: string;

  constructor(retryAfterSeconds: number) {
    super("Too many attempts");
    this.code = `ratelimited:${Math.max(1, Math.ceil(retryAfterSeconds))}`;
  }
}

/** The wait in seconds when a sign-in failed on the rate limit, else null. */
export function rateLimitedSeconds(error: unknown): number | null {
  const code = error instanceof CredentialsSignin ? error.code : undefined;
  const match = typeof code === "string" ? /^ratelimited:(\d+)$/.exec(code) : null;
  return match ? Number(match[1]) : null;
}

/**
 * True for Auth.js sign-in failures (bad credentials, etc.). Lets the web app
 * distinguish them from Next.js control-flow throws (redirects) without taking a
 * direct next-auth dependency.
 */
export function isAuthError(error: unknown): boolean {
  return error instanceof AuthError;
}
