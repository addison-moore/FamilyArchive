import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";

import { searchPersonChoices } from "@/lib/people";

/**
 * People by name for the person picker. Viewer level, so members and anyone on a
 * public archive can use it, and everyone else gets the same 404 as an archive that
 * doesn't exist. A GET rather than a server action: Next runs a client's actions one
 * at a time and can't cancel them, so a slow keystroke would hold up every later one.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ treeId: string }> },
): Promise<Response> {
  const { treeId } = await params;
  try {
    await requireTreeRole(treeId, "viewer");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const result = await searchPersonChoices(
    treeId,
    searchParams.get("q") ?? "",
    searchParams.getAll("exclude"),
  );
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
