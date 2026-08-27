import Link from "next/link";
import type { ReactNode } from "react";

export function Breadcrumbs({
  items,
}: {
  items: Array<{ href?: string; label: ReactNode; current?: boolean }>;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[12px] text-[#5F7468]">
        {items.map((item, index) => (
          <li key={`${String(item.label)}-${index}`} className="flex items-center gap-1">
            {index > 0 ? (
              <span aria-hidden className="text-[#B9C3BC]">
                /
              </span>
            ) : null}
            {item.href && !item.current ? (
              <Link href={item.href} className="hover:text-foreground hover:underline">
                {item.label}
              </Link>
            ) : (
              <span
                className={item.current ? "font-medium text-foreground" : undefined}
                aria-current={item.current ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
