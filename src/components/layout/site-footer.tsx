import { footerDisclaimer, productName } from "@/lib/navigation";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <p className="text-xs font-medium tracking-wide text-foreground">
          {productName}
        </p>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          {footerDisclaimer}
        </p>
      </div>
    </footer>
  );
}
