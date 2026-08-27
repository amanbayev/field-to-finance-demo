export function WorkspaceSwitcher({
  organizationName,
  roleLabel,
  operatorLabel,
  label,
}: {
  organizationName: string;
  roleLabel: string;
  operatorLabel?: string;
  label?: string;
}) {
  return (
    <div>
      {label ? (
        <p className="mb-1.5 text-[10px] tracking-[0.14em] text-[#7B857F] uppercase">{label}</p>
      ) : null}
      <div className="rounded-md border border-border bg-card px-2.5 py-2">
        <p className="truncate text-[12px] font-medium text-foreground">{organizationName}</p>
        <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
        {operatorLabel ? (
          <p className="mt-1 truncate text-[10px] tracking-wide text-[#7B857F]">{operatorLabel}</p>
        ) : null}
      </div>
    </div>
  );
}
