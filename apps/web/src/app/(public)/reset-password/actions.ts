"use server";

import { hashPassword, MIN_PASSWORD_LENGTH } from "@familyarchive/auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { consumeResetToken, emailForResetToken } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  confirm: z.string(),
});

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  const token = String(formData.get("token") ?? "");
  const back = (error: string) =>
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${error}`);

  if (!parsed.success) back("password");
  else if (parsed.data.password !== parsed.data.confirm) back("mismatch");
  else {
    const email = await emailForResetToken(parsed.data.token);
    if (!email) back("expired");
    else {
      await consumeResetToken(email, await hashPassword(parsed.data.password));
      redirect("/login?reset=1");
    }
  }
}
