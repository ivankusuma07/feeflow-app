import * as React from "react";
import { cn } from "./cn";

type CardProps<T extends React.ElementType> = {
  as?: T;
  /** Removes inner padding, for cards that hold a table or a full-bleed image. */
  flush?: boolean;
  tone?: "default" | "strong" | "muted" | "accent";
} & Omit<React.ComponentPropsWithoutRef<T>, "as">;

const tones = {
  default: "",
  strong: "border-ink",
  muted: "bg-bg",
  accent: "bg-accent border-ink",
} as const;

export function Card<T extends React.ElementType = "div">({
  as,
  flush,
  tone = "default",
  className,
  ...props
}: CardProps<T>) {
  const Comp = as ?? "div";
  return <Comp className={cn("card", flush && "p-0", tones[tone], className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("m-0 text-lg font-semibold", className)} {...props} />;
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-3", className)}>
      {typeof title === "string" ? <CardTitle>{title}</CardTitle> : title}
      {action}
    </div>
  );
}
