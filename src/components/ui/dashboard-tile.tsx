import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

// Premium KPI tile for the Dashboard. Big tabular number + small label +
// status-coloured left bar + soft glow when the metric is "live"
// (non-zero) AND a non-muted tone is set.
//
// Phase 2.2 — component lives here but is NOT yet wired into Dashboard.
// Dashboard's existing `StatTile` continues to render the live page;
// this component shows up only in /design-preview (Phase 2.3) until
// the full dashboard refit lands in Phase 4. That delay keeps the
// "live UI unchanged" promise from the Phase 2 brief.

export type DashboardTileTone = 'destructive' | 'warning' | 'success' | 'primary' | 'muted';

const toneClass: Record<DashboardTileTone, { number: string; label: string; icon: string; bar: string; glow: string }> = {
  destructive: {
    number: 'text-destructive-ink',
    label:  'text-destructive-ink',
    icon:   'text-destructive',
    bar:    'bg-destructive',
    glow:   'shadow-glow-destructive',
  },
  warning: {
    number: 'text-warning-ink',
    label:  'text-warning-ink',
    icon:   'text-warning',
    bar:    'bg-warning',
    glow:   'shadow-glow-amber',
  },
  success: {
    number: 'text-success-ink',
    label:  'text-success-ink',
    icon:   'text-success',
    bar:    'bg-success',
    glow:   'shadow-glow-success',
  },
  primary: {
    number: 'text-primary-ink',
    label:  'text-primary-ink',
    icon:   'text-primary',
    bar:    'bg-primary',
    glow:   'shadow-glow-blue',
  },
  muted: {
    number: 'text-foreground-72',
    label:  'text-muted-foreground',
    icon:   'text-muted-foreground',
    bar:    'bg-border',
    glow:   '',
  },
};

export interface DashboardTileProps {
  label: string;
  count: number | null;
  isLoading?: boolean;
  tone: DashboardTileTone;
  icon: LucideIcon;
  to: string;
  /** Optional click side-effect, e.g. bucket selection in a filter store. */
  onView?: () => void;
  /** Explicit glow toggle. Defaults to (count > 0 && tone !== 'muted'). */
  glow?: boolean;
  /** Optional trailing element on the bottom-right of the tile (e.g. delta). */
  trailing?: React.ReactNode;
  className?: string;
}

export const DashboardTile = React.forwardRef<HTMLDivElement, DashboardTileProps>(
  (
    { label, count, isLoading, tone, icon: Icon, to, onView, glow, trailing, className },
    ref,
  ) => {
    const value = count ?? 0;
    const isLive = value > 0 && tone !== 'muted';
    const effectiveTone = isLive ? tone : 'muted';
    const t = toneClass[effectiveTone];
    const showGlow = glow ?? isLive;

    return (
      <Card
        ref={ref}
        className={cn(
          'relative overflow-hidden transition-shadow duration-200',
          showGlow && t.glow,
          'hover:shadow-glow-blue',
          className,
        )}
      >
        <div className={cn('absolute left-0 top-0 bottom-0 w-1', t.bar)} aria-hidden />
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className={cn('text-xs font-semibold uppercase tracking-wider', t.label)}>
              {label}
            </span>
            <Icon className={cn('h-4 w-4', t.icon)} />
          </div>
          <div
            className={cn(
              'text-tabular mt-3 text-4xl font-bold leading-none',
              t.number,
            )}
          >
            {isLoading ? (
              <Loader2 className="text-muted-foreground h-7 w-7 animate-spin" />
            ) : (
              (count ?? '—')
            )}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Link
              to={to}
              onClick={onView}
              className="text-muted-foreground hover:text-foreground inline-flex items-center text-xs font-medium transition-colors"
            >
              View all <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
            {trailing && <div className="text-subtle-foreground text-xs">{trailing}</div>}
          </div>
        </CardContent>
      </Card>
    );
  },
);
DashboardTile.displayName = 'DashboardTile';
