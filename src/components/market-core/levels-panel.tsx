import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";

export function LevelsPanel({
  title,
  levels,
}: {
  title: string;
  levels: Array<{ label: string; detail: string }>;
}) {
  return (
    <Panel>
      <PanelHeader title={title} />
      <PanelBody>
        <ol className="grid gap-3 sm:grid-cols-3">
          {levels.map((level, index) => (
            <li key={level.label} className="border border-border bg-background px-3 py-3">
              <p className="label-caps text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-1 text-sm font-medium">{level.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {level.detail}
              </p>
            </li>
          ))}
        </ol>
      </PanelBody>
    </Panel>
  );
}
