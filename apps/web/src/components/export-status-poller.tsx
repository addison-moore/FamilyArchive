"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While an export is being prepared, poll its status and refresh the page
 * when it settles so the download button appears without a manual reload.
 */
export function ExportStatusPoller({ treeId }: { treeId: string }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/trees/${treeId}/export`);
        if (!response.ok) return;
        const { export: row } = (await response.json()) as {
          export: { status: string } | null;
        };
        if (!row || (row.status !== "pending" && row.status !== "running")) {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // transient network hiccup — keep polling
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [treeId, router]);

  return null;
}
