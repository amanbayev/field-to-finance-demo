export function SpvStack({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div>
      <p className="label-caps text-harvest">{title}</p>
      <ol className="mt-3 divide-y divide-harvest/15 border-y border-harvest/20">
        {rows.map((row, index) => (
          <li key={row.label} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
            <p className="flex items-baseline gap-3">
              <span className="font-tabular text-[10px] tracking-widest text-straw">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="label-caps text-straw">{row.label}</span>
            </p>
            <p className="text-sm text-bone">{row.value}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
