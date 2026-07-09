import { type InputHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 text-sm outline-none",
        "placeholder:text-[rgb(var(--muted-foreground))] focus:ring-2 focus:ring-[rgb(var(--primary))]",
        className
      )}
      {...props}
    />
  );
}
