import { Card, ProgressBar } from "@feeflow/ui";

interface StatCardProps {
  label: string;
  /** Primary figure, already formatted. `null` renders "—" (not live or no data). */
  value: string | null;
  unit?: string;
  secondary?: string | null;
  /** 0..1 progress, or `null` for an empty track. Omit for no bar. */
  progress?: number | null;
  progressLabel?: string;
  footnote?: React.ReactNode;
  className?: string;
}

/** Metric card. Shows "—" until real data exists; never sample numbers. */
export function StatCard({
  label,
  value,
  unit,
  secondary,
  progress,
  progressLabel,
  footnote,
  className,
}: StatCardProps) {
  return (
    <Card className={className}>
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2.5 font-mono text-[32px] leading-tight font-medium">
        {value ?? "—"}
        {value !== null && unit ? <span className="text-[15px]"> {unit}</span> : null}
      </div>
      {secondary ? <div className="mt-1 font-mono text-sm text-muted">{secondary}</div> : null}
      {progress !== undefined && (
        <ProgressBar
          className="mt-4"
          value={progress}
          label={progressLabel ?? label}
          variant={progress === null ? "empty" : "card"}
        />
      )}
      {footnote ? <div className="mt-3 text-xs leading-normal text-muted">{footnote}</div> : null}
    </Card>
  );
}
