export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-4 w-full max-w-xl rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
