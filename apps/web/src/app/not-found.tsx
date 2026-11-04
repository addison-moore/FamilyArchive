import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass, Card } from "@/components/form";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Card>
        <h1 className="mb-2 text-xl font-semibold">Page not found</h1>
        <p className="mb-4 text-sm text-archive-700">
          This page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Link href="/" className={`${buttonClass} inline-block no-underline`}>
          Back to your archive
        </Link>
      </Card>
    </div>
  );
}
