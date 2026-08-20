import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="max-w-lg">
      <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        Not found
      </p>
      <h1 className="mt-2 font-heading text-3xl">Record not available</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This identifier does not exist in the demonstration dataset.
      </p>
      <Button className="mt-6" render={<Link href="/" />}>
        Return to dashboard
      </Button>
    </div>
  );
}
