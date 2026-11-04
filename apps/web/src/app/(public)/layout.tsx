import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="py-8 text-center">
        <span className="text-2xl font-semibold tracking-tight">
          Family<span className="text-accent-600">Archive</span>
        </span>
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-8">{children}</main>
    </>
  );
}
