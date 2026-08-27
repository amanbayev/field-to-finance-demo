import type { ReactNode } from "react";
import { DeskStage } from "@/components/surface/desk-stage-hero";

export function SectionHeading({
  eyebrow,
  title,
  description,
  photo,
  photoAlt,
  photoPosition,
  kenBurnsOrigin,
  asOfLabel,
  variant,
  figure,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  photo?: string;
  photoAlt?: string;
  photoPosition?: string;
  kenBurnsOrigin?: "center" | "left" | "right" | "bottom";
  asOfLabel?: string;
  variant?: "page" | "overview";
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
      photoPosition={photoPosition}
      kenBurnsOrigin={kenBurnsOrigin}
      asOfLabel={asOfLabel}
      variant={variant}
      figure={figure}
      className={className}
    />
  );
}
