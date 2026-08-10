"use server";

import { clientIp, consumeRateLimit, RESET_PER_EMAIL, RESET_PER_IP } from "@familyarchive/auth";
import { getEnv } from "@familyarchive/config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enqueueEmail, smtpConfigured } from "@/lib/email";
import { renderBrandedEmail } from "@familyarchive/shared";
import { createPasswordResetToken } from "@/lib/password-reset";

/**
 * Every request counts, not just the ones that find an account: sending mail to
 * a real address on demand is exactly what the abuse looks like, so success is
 * not a reason to forgive the attempt.
 */
async function withinResetLimit(email: string): Promise<boolean> {
  const ip = clientIp(await headers());
  const [byEmail, byIp] = await Promise.all([
    consumeRateLimit(`reset:email:${email}`, RESET_PER_EMAIL),
    ip === "unknown"
      ? Promise.resolve({ allowed: true, retryAfterSeconds: 0 })
      : consumeRateLimit(`reset:ip:${ip}`, RESET_PER_IP),
  ]);
  return byEmail.allowed && byIp.allowed;
}

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const parsed = z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .safeParse(String(formData.get("email") ?? ""));

  // Same destination whether or not the account exists — no way to probe
  // which emails are registered here. A throttled request lands there too, so
  // the limiter cannot be used to tell registered addresses apart either.
  if (parsed.success && smtpConfigured() && (await withinResetLimit(parsed.data))) {
    const email = parsed.data;
    const rawToken = await createPasswordResetToken(email);
    if (rawToken) {
      const resetUrl = `${getEnv().APP_URL}/reset-password?token=${rawToken}`;
      await enqueueEmail({
        to: email,
        subject: "Reset your FamilyArchive password",
        text:
          `Someone (hopefully you) asked to reset the password for this email on FamilyArchive.\n\n` +
          `Open this link to choose a new password:\n${resetUrl}\n\n` +
          `The link is valid for one hour. If you didn't ask for this, you can ignore this email.`,
        html: renderBrandedEmail({
          heading: "Reset your password",
          bodyLines: [
            "Someone (hopefully you) asked to reset the password for this email on FamilyArchive.",
          ],
          cta: { label: "Choose a new password", url: resetUrl },
          footerNote:
            "The link is valid for one hour. If you didn't ask for this, you can ignore this email.",
        }),
      });
    }
  }
  redirect("/forgot-password?sent=1");
}
