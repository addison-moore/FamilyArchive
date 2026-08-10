"use server";

import { isAuthError, signIn } from "@familyarchive/auth";
import { redirect } from "next/navigation";

import { createOwnerIfFirst, registrationSchema } from "@/lib/users";

export async function registerOwnerAction(formData: FormData): Promise<void> {
  const parsed = registrationSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/register?error=${encodeURIComponent(message)}`);
  }

  // Owner bootstrap is only available while the instance has no users. The
  // check lives inside the insert's transaction: a separate read first let two
  // simultaneous registrations both see an empty instance and both become Owner.
  const result = await createOwnerIfFirst(parsed.data);
  if (result.status === "exists") redirect("/register");
  if (result.status === "duplicate") {
    redirect(`/register?error=${encodeURIComponent("Email already registered")}`);
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (isAuthError(error)) redirect("/login");
    throw error;
  }
}
