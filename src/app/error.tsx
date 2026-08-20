"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-lg">
      <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        System
      </p>
      <h1 className="mt-2 font-heading text-3xl">Unable to load this view</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The prototype could not render this page. Retry, or return to the
        dashboard.
      </p>
      <Button className="mt-6" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
