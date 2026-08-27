import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DeskStage } from "@/components/surface/desk-stage";

export function SectionHeading({
  eyebrow,
  title,
  description,
  photo,
  photoAlt,
  figure,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  photo?: string;
  photoAlt?: string;
  figure?: ReactNode;
  className?: string;
}) {
  return (
    <DeskStage
      kicker={eyebrow}
      title={title}
      lead={description}
      photo={photo}
      photoAlt={photoAlt}
      figure={figure}
      className={className}
    />
  );
}
