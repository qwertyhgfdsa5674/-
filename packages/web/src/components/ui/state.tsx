import { AlertCircle, Loader2, PackageOpen } from "lucide-react";

import { ApiRequestError } from "../../api/client";
import { Button } from "./button";

export function LoadingState() {
  return (
    <div className="flex min-h-64 items-center justify-center text-[rgb(var(--muted-foreground))]">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Loading data
    </div>
  );
}

export function EmptyState({ title = "No data" }: { title?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-[rgb(var(--muted-foreground))]">
      <PackageOpen className="h-8 w-8" />
      <p className="text-sm">{title}</p>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error?: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-[rgb(var(--muted-foreground))]">
      <AlertCircle className="h-8 w-8 text-[rgb(var(--destructive))]" />
      <p className="text-sm">Data failed to load</p>
      <p className="max-w-md text-center text-xs">{errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return "API authentication failed. Check API_KEY and Authorization.";
    }

    if (error.status === 429) {
      return "API rate limit reached. Retry after a short wait.";
    }

    return `API returned HTTP ${error.status}.`;
  }

  if (error instanceof TypeError) {
    return "Backend is unreachable. Check whether the server is running.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
}
