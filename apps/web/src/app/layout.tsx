import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "FamilyArchive",
  description: "Self-hosted family history and media archive",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-archive-50 text-archive-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
