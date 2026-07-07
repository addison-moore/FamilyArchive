import { AuthError } from "next-auth";

/**
 * True for Auth.js sign-in failures (bad credentials, etc.). Lets the web app
 * distinguish them from Next.js control-flow throws (redirects) without taking a
 * direct next-auth dependency.
 */
export function isAuthError(error: unknown): boolean {
  return error instanceof AuthError;
}
