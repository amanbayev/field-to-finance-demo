import Link from "next/link";

export function Breadcrumbs({
  items,
}: {
  items: Array<{ href?: string; label: string; current?: boolean }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-[12px] text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const current = item.current ?? index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden>/</span> : null}
              {item.href && !current ? (
                <Link
                  href={item.href}
                  className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={current ? "font-medium text-foreground" : undefined}
                  aria-current={current ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
