import { getSessionUser } from "@familyarchive/auth";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FamilyArchive", template: "%s · FamilyArchive" },
  description: "Self-hosted family history and media archive",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Dark mode is a per-user preference, applied server-side so there is no
  // flash of the wrong theme. Anonymous visitors always get light (default).
  const user = await getSessionUser();
  const dark = user?.theme === "dark";

  return (
    <html lang="en" className={dark ? "dark" : undefined}>
      <body
        style={{ colorScheme: dark ? "dark" : "light" }}
        className="min-h-screen bg-archive-50 text-archive-900 antialiased"
      >
        {children}
      </body>
    </html>
  );
}
