"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function AppChrome({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/ui-v2")) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  }

  return (
    <>
      {header}
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
      {footer}
    </>
  );
}
