import { AuthorizationError, requireTreeRole } from "@familyarchive/auth";

import { generateGedcom } from "@familyarchive/gedcom";

/** GEDCOM export (PRD §14.5, §5.5) — any tree member may export. */
export async function GET(
  _request: Request,
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

  const result = await generateGedcom(treeId);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });

  return new Response(result.content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
    },
  });
}
