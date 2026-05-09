import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Shared list-page header: section label / hero title / subtitle row +
// trailing action slot, then a hairline separator. Used by Tasks,
// Follow-ups, Inspections.
export function PageHeader({
  eyebrow,
  title,
  stats,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  stats?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'border-border space-y-2 border-b pb-5',
        className,
      )}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          {eyebrow && (
            <div className="text-section-label text-primary-ink/80">{eyebrow}</div>
          )}
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            {title}
          </h1>
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      {stats && (
        <div className="text-muted-foreground flex items-center gap-x-4 gap-y-1 text-sm">
          {stats}
        </div>
      )}
    </header>
  );
}

// Inline stat used inside PageHeader's stats slot. Tone-coloured dot + label.
export function HeaderStat({
  count,
  label,
  tone = 'muted',
}: {
  count: number;
  label: string;
  tone?: 'destructive' | 'warning' | 'primary' | 'success' | 'muted';
}) {
  const dotClass = {
    destructive: 'bg-destructive',
    warning: 'bg-warning',
    primary: 'bg-primary',
    success: 'bg-success',
    muted: 'bg-muted-foreground',
  }[tone];
  const textClass = {
    destructive: 'text-destructive-ink',
    warning: 'text-warning-ink',
    primary: 'text-primary-ink',
    success: 'text-success-ink',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      <span className={cn('tabular-nums font-medium', textClass)}>{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
