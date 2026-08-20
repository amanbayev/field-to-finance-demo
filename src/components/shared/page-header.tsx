export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8 max-w-3xl">
      {eyebrow ? (
        <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-heading text-3xl tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}
