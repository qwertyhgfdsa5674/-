import { type HTMLAttributes, type TableHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn("w-full border-collapse text-sm", className)}
      {...props}
    />
  );
}

export function Th({
  className,
  ...props
}: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-[rgb(var(--border))] px-3 py-3 text-left text-xs font-semibold uppercase text-[rgb(var(--muted-foreground))]",
        className
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  ...props
}: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-[rgb(var(--border))] px-3 py-3 align-middle",
        className
      )}
      {...props}
    />
  );
}
