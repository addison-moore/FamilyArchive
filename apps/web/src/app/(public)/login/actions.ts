"use server";

import { isAuthError, signIn } from "@familyarchive/auth";
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
      redirect(`/login?error=1&callbackUrl=${encodeURIComponent(redirectTo)}`);
    }
    throw error; // NEXT_REDIRECT on success — must propagate
  }
}
