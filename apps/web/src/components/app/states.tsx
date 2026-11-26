import { Button, Card, cn } from "@feeflow/ui";
import Image from "next/image";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  /** Show the "empty" illustration from the design bundle. */
  illustration?: boolean;
  className?: string;
}

export function EmptyState({ title, body, action, illustration, className }: EmptyStateProps) {
  return (
    <Card className={cn("flex flex-col items-center gap-3 py-10 text-center", className)}>
      {illustration ? (
        <Image
          src="/illustrations/empty.webp"
          alt=""
          width={280}
          height={210}
          // Empty states sit at the top of the page and are usually its largest paint.
          loading="eager"
          className="h-auto w-56"
        />
      ) : null}
      <h2 className="m-0 text-lg font-semibold">{title}</h2>
      {body ? <div className="max-w-md text-sm leading-relaxed text-muted">{body}</div> : null}
      {action}
    </Card>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Couldn’t load this",
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <Card className={cn("flex flex-col items-start gap-3", className)} role="alert">
      <h2 className="m-0 text-lg font-semibold">{title}</h2>
      <p className="m-0 text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Card>
  );
}

/** Placeholder block while data loads. Hidden from assistive tech; mark the region aria-busy. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-md bg-subtle", className)} />;
}
