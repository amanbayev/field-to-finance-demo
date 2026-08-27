export function DistributionDiagram({
  title,
  coreLabel,
  channels,
  coreLayers,
  settlementLayers,
  notes,
}: {
  title: string;
  coreLabel: string;
  channels: readonly string[];
  coreLayers: readonly string[];
  settlementLayers: readonly string[];
  notes: readonly string[];
}) {
  return (
    <div>
      <p className="label-caps text-harvest">{title}</p>
      <p className="mt-4 label-caps text-straw">{coreLabel}</p>
      <ul className="mt-3 divide-y divide-harvest/15 border-y border-harvest/20">
        {channels.map((channel, index) => (
          <li key={channel} className="flex items-baseline gap-3 py-3">
            <span className="font-tabular text-[10px] tracking-widest text-harvest">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-sm text-bone">{channel}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {coreLayers.map((layer) => (
          <li key={layer} className="text-sm text-straw">
            {layer}
          </li>
        ))}
      </ul>
      <ul className="mt-6 divide-y divide-harvest/15 border-y border-harvest/20">
        {settlementLayers.map((layer) => (
          <li key={layer} className="py-3 text-sm text-bone">
            {layer}
          </li>
        ))}
      </ul>
      <ul className="mt-6 space-y-2 text-sm text-straw">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
