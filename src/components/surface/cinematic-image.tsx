import Image from "next/image";
import { cn } from "@/lib/utils";

export function CinematicImage({
  src,
  alt,
  kenBurns = false,
  priority = false,
  className,
  sizes = "100vw",
}: {
  src: string;
  alt: string;
  kenBurns?: boolean;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  return (
      <div className={cn("relative overflow-hidden bg-ink", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={cn(
          "object-cover",
          kenBurns && "motion-kenburns will-change-transform",
        )}
      />
    </div>
  );
}
