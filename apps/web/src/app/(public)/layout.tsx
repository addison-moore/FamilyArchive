import type { ReactNode } from "react";

import { Wordmark } from "@/components/wordmark";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex justify-center py-8">
        <Wordmark className="h-7" />
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-8">{children}</main>
    </>
  );
}
