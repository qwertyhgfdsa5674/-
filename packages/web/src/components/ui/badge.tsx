import { type HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-[rgb(var(--muted))] text-[rgb(var(--muted-foreground))]",
  success: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  danger: "bg-red-500/12 text-red-700 dark:text-red-300",
  info: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300"
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
