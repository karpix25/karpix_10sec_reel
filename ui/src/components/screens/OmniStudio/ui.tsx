"use client";

import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OmniReelSegment } from "@/lib/omni/types";

export function WorkbenchPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-1 max-w-prose text-xs leading-5 text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-sm">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 leading-5 text-muted-foreground">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function QueryState({
  isLoading,
  isError,
  loadingText,
  errorText,
}: {
  isLoading?: boolean;
  isError?: boolean;
  loadingText: string;
  errorText: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {loadingText}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        {errorText}
      </div>
    );
  }
  return null;
}

export function ReadinessItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
      <span className={done ? "font-medium text-foreground" : ""}>{label}</span>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant = status === "completed" ? "success" : status === "failed" ? "destructive" : "secondary";
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}

export function SegmentDots({ segments }: { segments: OmniReelSegment[] }) {
  if (!segments.length) return <span className="text-xs text-muted-foreground">segments pending</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {segments.map((segment) => (
        <span
          key={segment.id}
          title={`${segment.segment_index}: ${segment.status}`}
          className={cn(
            "h-2.5 w-8 rounded-full",
            segment.status === "completed" && "bg-emerald-500",
            segment.status === "failed" && "bg-destructive",
            segment.status === "processing" && "bg-amber-500",
            !["completed", "failed", "processing"].includes(segment.status) && "bg-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}
