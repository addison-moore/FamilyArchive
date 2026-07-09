import type { ReactNode } from "react";

import { DocsSidebar } from "@/components/docs-sidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 lg:flex lg:gap-10">
      <DocsSidebar />
      <div className="min-w-0 max-w-3xl flex-1">{children}</div>
    </div>
  );
}
