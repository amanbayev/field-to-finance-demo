import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";

export function SpvStack({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <Panel>
      <PanelHeader title={title} />
      <PanelBody>
        <ol className="space-y-2 text-sm">
          {rows.map((row, index) => (
            <li key={row.label}>
              {index > 0 ? (
                <p className="mb-1 pl-2 text-xs text-muted-foreground">↓</p>
              ) : null}
              <div className="border border-border bg-background px-3 py-2">
                <p className="label-caps text-muted-foreground">{row.label}</p>
                <p className="font-medium">{row.value}</p>
              </div>
            </li>
          ))}
        </ol>
      </PanelBody>
    </Panel>
  );
}
