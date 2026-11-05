"use server";

import { hashPassword, isAuthError, requireUser, signIn } from "@familyarchive/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { changeEmail, changePassword, checkCurrentPassword, updateName } from "@/lib/account";
import { registrationSchema } from "@/lib/users";

function back(error: string): never {
  redirect(`/account?error=${error}`);
}

export async function updateNameAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = registrationSchema.shape.name.safeParse(formData.get("name"));
  if (!parsed.success) back("name");

  await updateName(user.id, parsed.data);
  // The account menu in every page's header shows it.
  revalidatePath("/", "layout");
  redirect("/account?saved=name");
}

export async function changeEmailAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = registrationSchema.shape.email.safeParse(formData.get("email"));
  if (!parsed.success) back("email");
  if (parsed.data === user.email) back("sameEmail");

  const check = await checkCurrentPassword(user, String(formData.get("currentPassword") ?? ""));
  if (check !== "ok") back(check);

  // After the password check, so "taken" can't be used to probe addresses without it.
  if (!(await changeEmail(user, parsed.data))) back("taken");
  revalidatePath("/", "layout");
  redirect("/account?saved=email");
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  if (!registrationSchema.shape.password.safeParse(password).success) back("password");
  if (password !== String(formData.get("confirm") ?? "")) back("mismatch");

  const current = String(formData.get("currentPassword") ?? "");
  const check = await checkCurrentPassword(user, current);
  if (check !== "ok") back(check);
  if (password === current) back("samePassword");

  if (!(await changePassword(user, await hashPassword(password)))) back("wrong");

  // That revoked this session along with the others. Signing in again mints a token
  // stamped with the new updatedAt and sets its cookie on this response, so the person
  // who changed the password stays signed in.
  try {
    await signIn("credentials", {
      email: user.email,
      password,
      redirect: false,
      redirectTo: "/account",
    });
  } catch (error) {
    // Most likely the sign-in limiter, if someone is hammering this address. The
    // password has changed either way, and this page says so.
    if (isAuthError(error)) redirect("/login?reset=1");
    throw error;
  }
  redirect("/account?saved=password");
}
