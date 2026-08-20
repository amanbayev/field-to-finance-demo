export function DataList({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="border-b border-border/80 pb-3">
          <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
