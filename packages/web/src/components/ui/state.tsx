import { AlertCircle, Loader2, PackageOpen } from "lucide-react";

import { Button } from "./button";

export function LoadingState() {
  return (
    <div className="flex min-h-64 items-center justify-center text-[rgb(var(--muted-foreground))]">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      加载中
    </div>
  );
}

export function EmptyState({ title = "暂无数据" }: { title?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-[rgb(var(--muted-foreground))]">
      <PackageOpen className="h-8 w-8" />
      <p className="text-sm">{title}</p>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-[rgb(var(--muted-foreground))]">
      <AlertCircle className="h-8 w-8 text-[rgb(var(--destructive))]" />
      <p className="text-sm">数据加载失败</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  );
}
