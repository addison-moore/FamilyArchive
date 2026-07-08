import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FamilyArchive", template: "%s · FamilyArchive" },
  description: "Self-hosted family history and media archive",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-archive-50 text-archive-900 antialiased">{children}</body>
    </html>
  );
}
