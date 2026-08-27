import { deskIndex } from "@/components/surface/desk-stage";

export function LevelsPanel({
  title,
  levels,
}: {
  title: string;
  levels: Array<{ label: string; detail: string }>;
}) {
  return (
    <div>
      <p className="label-caps text-harvest">{title}</p>
      <ol className="mt-3 divide-y divide-harvest/15 border-y border-harvest/20">
        {levels.map((level, index) => (
          <li key={level.label} className="flex gap-4 py-4">
            <span className="font-tabular text-[10px] tracking-widest text-harvest">
              {deskIndex(index)}
            </span>
            <div>
              <p className="text-sm text-bone">{level.label}</p>
              <p className="mt-1 text-sm leading-relaxed text-straw">{level.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
