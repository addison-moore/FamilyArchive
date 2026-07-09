import Image from "next/image";

/**
 * Product screenshot with light/dark variants that follow the visitor's OS
 * theme (Tailwind's default `dark:` variant is prefers-color-scheme). Files
 * live in public/screenshots as `<name>-light.png` / `<name>-dark.png`,
 * captured by tests/smoke/scripts/capture-site-screenshots.mjs.
 */
export function Screenshot({
  name,
  alt,
  priority = false,
  framed = false,
}: {
  name: string;
  alt: string;
  priority?: boolean;
  framed?: boolean;
}) {
  const image = (variant: "light" | "dark") => (
    <Image
      src={`/screenshots/${name}-${variant}.png`}
      alt={alt}
      width={1440}
      height={900}
      priority={priority && variant === "light"}
      className={variant === "light" ? "dark:hidden" : "hidden dark:block"}
    />
  );

  const picture = (
    <>
      {image("light")}
      {image("dark")}
    </>
  );

  if (!framed) {
    return (
      <div className="overflow-hidden rounded-xl border border-archive-100 shadow-sm">
        {picture}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-archive-100 bg-surface shadow-lg">
      {/* Minimal browser chrome so the hero shot reads as "the app, running". */}
      <div className="flex items-center gap-1.5 border-b border-archive-100 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-archive-100" />
        <span className="h-2.5 w-2.5 rounded-full bg-archive-100" />
        <span className="h-2.5 w-2.5 rounded-full bg-archive-100" />
      </div>
      {picture}
    </div>
  );
}
