import { getEnv } from "@familyarchive/config";
import { getDb, getInstanceUsage, setUsageNotifiedLevel, users } from "@familyarchive/db";
import { renderBrandedEmail } from "@familyarchive/shared";
import { eq } from "drizzle-orm";

import { enqueueEmail, smtpConfigured } from "@/lib/email";

export interface QuotaState {
  /** null = no quota configured (unlimited). */
  quotaBytes: number | null;
  usedBytes: number;
  originalBytes: number;
  derivativeBytes: number;
  mediaCount: number;
  /** 0–100+, null when unlimited. */
  percent: number | null;
  updatedAt: Date;
}

export async function quotaState(): Promise<QuotaState> {
  const env = getEnv();
  const usage = await getInstanceUsage();
  const usedBytes = usage.originalBytes + usage.derivativeBytes;
  const quotaBytes = env.MEDIA_QUOTA_MB > 0 ? env.MEDIA_QUOTA_MB * 1024 * 1024 : null;
  return {
    quotaBytes,
    usedBytes,
    originalBytes: usage.originalBytes,
    derivativeBytes: usage.derivativeBytes,
    mediaCount: usage.mediaCount,
    percent: quotaBytes ? Math.round((usedBytes / quotaBytes) * 100) : null,
    updatedAt: usage.updatedAt,
  };
}

export function formatStorage(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

/**
 * Email instance owners when usage crosses 90% or 100% of the quota — once per
 * crossing (tracked on the usage row, reset when usage drops back under 90%).
 * Silent no-op without SMTP.
 */
export async function maybeNotifyOwners(): Promise<void> {
  const env = getEnv();
  if (env.MEDIA_QUOTA_MB <= 0) return;
  const state = await quotaState();
  const usage = await getInstanceUsage();
  const percent = state.percent ?? 0;

  const level: 0 | 90 | 100 = percent >= 100 ? 100 : percent >= 90 ? 90 : 0;
  if (level === usage.notifiedLevel) return;
  if (level < usage.notifiedLevel) {
    await setUsageNotifiedLevel(level);
    return;
  }
  await setUsageNotifiedLevel(level);
  if (!smtpConfigured()) return;

  const owners = await getDb().select().from(users).where(eq(users.role, "owner"));
  const heading =
    level === 100 ? "Your archive's storage is full" : "Your archive's storage is almost full";
  const body =
    level === 100
      ? `Media storage has reached its ${env.MEDIA_QUOTA_MB} MB limit — new uploads are paused until space is freed or the limit is raised.`
      : `Media storage is at ${percent}% of its ${env.MEDIA_QUOTA_MB} MB limit.`;
  for (const owner of owners) {
    if (!owner.email) continue;
    await enqueueEmail({
      to: owner.email,
      subject: heading,
      text: `${body}\n\nCurrently used: ${formatStorage(state.usedBytes)}.`,
      html: renderBrandedEmail({
        heading,
        bodyLines: [body, `Currently used: ${formatStorage(state.usedBytes)}.`],
        cta: { label: "Open FamilyArchive", url: env.APP_URL },
      }),
    });
  }
}
