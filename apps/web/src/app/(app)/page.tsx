import { getSessionUser, getTreeRole } from "@familyarchive/auth";
import { redirect } from "next/navigation";

/** Landing logic (PRD §7.2): default tree when set and accessible, else tree selection. */
export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.defaultTreeId && (await getTreeRole(user, user.defaultTreeId))) {
    redirect(`/trees/${user.defaultTreeId}`);
  }
  redirect("/trees");
}
