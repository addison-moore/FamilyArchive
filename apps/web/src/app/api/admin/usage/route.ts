import { getEnv } from "@familyarchive/config";

import { quotaState } from "@/lib/quota";

/**
 * Machine-readable storage usage (storage-quota plan): for backup scripts and
 * external tooling to poll without a browser session. Gated by the
 * METRICS_TOKEN bearer env var; the endpoint does not exist when it is unset.
 */
export async function GET(request: Request): Promise<Response> {
  const token = getEnv().METRICS_TOKEN;
  if (!token) return Response.json({ error: "Not found" }, { status: 404 });

  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${token}`) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }

  const state = await quotaState();
  return Response.json({
    quotaMb: getEnv().MEDIA_QUOTA_MB || null,
    usedBytes: state.usedBytes,
    originalBytes: state.originalBytes,
    derivativeBytes: state.derivativeBytes,
    mediaCount: state.mediaCount,
    updatedAt: state.updatedAt,
  });
}
