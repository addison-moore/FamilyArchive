"use server";

import { getEnv } from "@familyarchive/config";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enqueueEmail, smtpConfigured } from "@/lib/email";
import { renderBrandedEmail } from "@/lib/email-template";
import { createPasswordResetToken } from "@/lib/password-reset";

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const parsed = z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .safeParse(String(formData.get("email") ?? ""));

  // Same destination whether or not the account exists — no way to probe
  // which emails are registered here.
  if (parsed.success && smtpConfigured()) {
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
