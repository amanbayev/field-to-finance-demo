import { DataList } from "@/components/shared/data-list";

export function InstrumentDisclosure({
  title,
  items,
  coverageDisclaimer,
  claimDisclaimer,
}: {
  title: string;
  items: { label: string; value: string }[];
  coverageDisclaimer: string;
  claimDisclaimer: string;
}) {
  return (
    <div className="border border-border bg-muted/30 px-3 py-3">
      <p className="label-caps mb-2">{title}</p>
      <DataList items={items} />
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{coverageDisclaimer}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{claimDisclaimer}</p>
    </div>
  );
}
