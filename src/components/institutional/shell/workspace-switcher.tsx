export function WorkspaceSwitcher({
  organizationName,
  roleLabel,
  operatorLabel,
}: {
  organizationName: string;
  roleLabel: string;
  operatorLabel?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <p className="truncate text-[12px] font-medium text-foreground">{organizationName}</p>
      <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
      {operatorLabel ? (
        <p className="mt-1 truncate text-[10px] tracking-wide text-[#7B857F]">{operatorLabel}</p>
      ) : null}
    </div>
  );
}
