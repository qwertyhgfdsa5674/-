import { Slot } from "@radix-ui/react-slot";
import { type ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

type ButtonVariant =
  "default" | "secondary" | "ghost" | "destructive" | "outline";
type ButtonSize = "sm" | "md" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  default:
    "bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] hover:opacity-90",
  secondary:
    "bg-[rgb(var(--muted))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--border))]",
  ghost: "hover:bg-[rgb(var(--muted))] text-[rgb(var(--foreground))]",
  destructive: "bg-[rgb(var(--destructive))] text-white hover:opacity-90",
  outline:
    "border border-[rgb(var(--border))] bg-transparent hover:bg-[rgb(var(--muted))]"
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  icon: "h-9 w-9 p-0"
};

export function Button({
  asChild,
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
