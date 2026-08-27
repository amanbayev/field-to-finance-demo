import type { ReactNode } from "react";
import { DeskSpine } from "@/components/surface/desk-spine";
import type { PermissionNavGroup } from "@/lib/auth/nav";

export function DeskFrame({
  groups,
  children,
}: {
  groups: PermissionNavGroup[];
  children: ReactNode;
}) {
  return (
    <div data-desk className="flex w-full min-h-[calc(100svh-3rem)]">
      <aside className="hidden w-[15.25rem] shrink-0 lg:block">
        <div className="sticky top-12 h-[calc(100svh-3rem)] overflow-y-auto">
          <DeskSpine groups={groups} />
        </div>
      </aside>
      <div data-desk-pane className="min-w-0 w-full flex-1">
        {children}
      </div>
    </div>
  );
}
