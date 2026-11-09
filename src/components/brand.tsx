import { cn } from "@/lib/utils";

/** Monogramme Fabrimétal : une plaque d'acier avec une barre de coulée. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-signal font-display text-lg font-extrabold text-signal-foreground",
        className,
      )}
    >
      F
      <span className="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full bg-signal-foreground/60" />
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
          className={cn(
            "eyebrow block",
            inverted ? "text-sidebar-muted" : "text-muted-foreground",
          )}
        >
          Sénégal · Personnel
        </span>
      </span>
    </span>
  );
}
