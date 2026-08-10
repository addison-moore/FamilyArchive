import { getEnv } from "@familyarchive/config";

import { timingSafeEqualString } from "@/lib/http";
import { quotaState } from "@/lib/quota";

/**
 * Machine-readable storage usage: for backup scripts and
 * external tooling to poll without a browser session. Gated by the
 * METRICS_TOKEN bearer env var; the endpoint does not exist when it is unset.
 */
export async function GET(request: Request): Promise<Response> {
  const token = getEnv().METRICS_TOKEN;
  if (!token) return Response.json({ error: "Not found" }, { status: 404 });

  // Constant-time: `!==` on a secret returns as soon as it hits a differing
  // byte, which leaks the shared token a character at a time to a caller that
  // can time the response.
  const header = request.headers.get("authorization") ?? "";
  if (!timingSafeEqualString(header, `Bearer ${token}`)) {
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
