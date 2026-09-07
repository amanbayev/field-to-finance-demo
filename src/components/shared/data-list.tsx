export function DataList({
  items,
}: {
  items: { label: string; value: React.ReactNode }[];
}) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="flex items-baseline justify-between gap-4 border-b border-harvest/15 py-2.5"
        >
            <dt className="label-caps min-w-0 break-words">{item.label}</dt>
            <dd className="min-w-0 text-right text-sm font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
