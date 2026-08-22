import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";

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
    <Panel>
      <PanelHeader title={title} />
      <PanelBody className="space-y-4 font-mono text-[11px] leading-relaxed sm:text-xs">
        <div className="grid gap-2 sm:grid-cols-3">
          {channels.map((channel) => (
            <div key={channel} className="border border-border bg-background px-3 py-2 text-center">
              {channel}
            </div>
          ))}
        </div>
        <p className="text-center text-muted-foreground">▼</p>
        <div className="border border-primary/40 bg-muted/30 px-3 py-3">
          <p className="mb-2 text-center text-[10px] tracking-[0.16em] text-primary uppercase">
            {coreLabel}
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {coreLayers.map((layer) => (
              <li key={layer}>· {layer}</li>
            ))}
          </ul>
        </div>
        <p className="text-center text-muted-foreground">▼</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {settlementLayers.map((layer) => (
            <div key={layer} className="border border-dashed border-border px-3 py-2">
              {layer}
            </div>
          ))}
        </div>
        <ul className="space-y-1 text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}
