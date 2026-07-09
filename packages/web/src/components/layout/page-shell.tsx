import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  action,
  children
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
