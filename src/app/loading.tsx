export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-5 w-40 bg-muted" />
      <div className="h-3 w-full max-w-xl bg-muted" />
      <div className="h-40 border border-border bg-card" />
    </div>
  );
}
