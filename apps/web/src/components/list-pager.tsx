import { PAGE_SIZES, type PageSize } from "@familyarchive/shared";
import Link from "next/link";

/**
 * Footer for a paginated list: how much is shown, page navigation, and the
 * rows-per-page choice. Page links are URL-based; the size control posts to a
 * server action so the choice is remembered for future sessions.
 */
export function ListPager({
  basePath,
  params,
  page,
  totalPages,
  shown,
  total,
  size,
  label,
  sizeAction,
  actionFields,
}: {
  /** Path the links and the size form point at, e.g. `/trees/abc/people`. */
  basePath: string;
  /** Query params carried across page and size changes (q, scope, selected…). */
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  /** Rows rendered on this page, for the "Showing 1–50 of 312" summary. */
  shown: number;
  total: number;
  size: PageSize;
  /** Plural noun for the summary line, e.g. "people". */
  label: string;
  sizeAction: (formData: FormData) => Promise<void>;
  /** Extra hidden fields the action needs, e.g. the tree id. */
  actionFields?: Record<string, string>;
}) {
  const carried = Object.entries(params).filter((entry): entry is [string, string] =>
    Boolean(entry[1]),
  );
  const pageHref = (target: number) => {
    const query = new URLSearchParams(carried);
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = first + shown - 1;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-archive-700">
      <span>
        Showing {first}–{last} of {total} {label}
      </span>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-2">
          <PageLink href={pageHref(page - 1)} disabled={page === 1}>
            Previous
          </PageLink>
          <span className="tabular-nums">
            Page {page} of {totalPages}
          </span>
          <PageLink href={pageHref(page + 1)} disabled={page === totalPages}>
            Next
          </PageLink>
        </nav>
      )}

      <form action={sizeAction} className="ml-auto flex items-center gap-2">
        {Object.entries(actionFields ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {/* `size` is deliberately omitted: the clicked button carries it, and a
            hidden field of the same name would win FormData.get(). */}
        {carried
          .filter(([name]) => name !== "size")
          .map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        <span id="page-size-label">Per page</span>
        <div
          role="group"
          aria-labelledby="page-size-label"
          className="flex rounded-md border border-archive-100 bg-surface p-0.5"
        >
          {PAGE_SIZES.map((option) => (
            <button
              key={option}
              type="submit"
              name="size"
              value={option}
              aria-current={option === size ? "true" : undefined}
              className={`rounded px-3 py-1.5 tabular-nums ${
                option === size
                  ? "bg-archive-100 font-medium"
                  : "text-archive-700 hover:bg-archive-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: string;
}) {
  const base = "rounded-md border border-archive-100 bg-surface px-3 py-1.5";
  if (disabled) {
    return (
      <span aria-disabled="true" className={`${base} text-archive-700/40`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${base} text-archive-700 no-underline hover:bg-archive-50`}>
      {children}
    </Link>
  );
}
