import { cn } from "@/lib/utils";

/** Monogramme Fabrimétal : un aplat rouge avec la lettre F. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary font-display text-lg font-extrabold text-primary-foreground",
        className,
      )}
    >
      F
    </span>
  );
}

export function BrandName({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <BrandMark />
      <span className="leading-tight">
        <span className="block font-display text-base font-bold tracking-tight">Fabrimétal</span>
        <span
          className={cn("eyebrow block", inverted ? "text-sidebar-muted" : "text-muted-foreground")}
        >
          Sénégal · Personnel
        </span>
      </span>
    </span>
  );
}
