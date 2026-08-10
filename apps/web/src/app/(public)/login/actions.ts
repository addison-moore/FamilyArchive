"use server";

import { describeRetryAfter, isAuthError, rateLimitedSeconds, signIn } from "@familyarchive/auth";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");
  // Only allow same-origin relative redirect targets.
  const redirectTo =
    callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (isAuthError(error)) {
      // Distinguish "throttled" from "wrong password" so the user is told to
      // wait rather than retrying into a limit they cannot see.
      const wait = rateLimitedSeconds(error);
      const params = new URLSearchParams({ callbackUrl: redirectTo });
      params.set("error", wait === null ? "1" : "ratelimited");
      if (wait !== null) params.set("retry", describeRetryAfter(wait));
      redirect(`/login?${params}`);
    }
    throw error; // NEXT_REDIRECT on success — must propagate
  }
}
