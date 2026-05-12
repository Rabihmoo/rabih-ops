import * as React from 'react';
import { cn } from '@/lib/utils';

// Rounded-full progress bar with a gradient fill and optional inline
// percentage label. CSS-only width transition (300ms). No motion lib.

export type ProgressTone = 'primary' | 'success' | 'warning' | 'destructive';
export type ProgressSize = 'sm' | 'md';

const trackHeight: Record<ProgressSize, string> = {
  sm: 'h-1',
  md: 'h-2',
};

const fillClass: Record<ProgressTone, string> = {
  primary:    'bg-gradient-to-r from-primary to-primary-hover',
  success:    'bg-gradient-to-r from-success/80 to-success',
  warning:    'bg-gradient-to-r from-warning/80 to-warning',
  destructive:'bg-gradient-to-r from-destructive/80 to-destructive',
};

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..100. Values outside this range are clamped. */
  value: number;
  tone?: ProgressTone;
  size?: ProgressSize;
  /** When true, renders a small "%n" label to the right of the bar. */
  showLabel?: boolean;
}

export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ value, tone = 'primary', size = 'md', showLabel, className, ...props }, ref) => {
    const clamped = Math.max(0, Math.min(100, value));
    return (
      <div
        ref={ref}
        className={cn('flex items-center gap-2', className)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        {...props}
      >
        <div
          className={cn(
            'flex-1 overflow-hidden rounded-pill bg-surface-2',
            trackHeight[size],
          )}
        >
          <div
            className={cn(
              'h-full rounded-pill transition-[width] duration-300 ease-out',
              fillClass[tone],
            )}
            style={{ width: `${clamped}%` }}
          />
        </div>
        {showLabel && (
          <span className="text-foreground-72 text-tabular w-9 shrink-0 text-right text-xs font-medium">
            {Math.round(clamped)}%
          </span>
        )}
      </div>
    );
  },
);
ProgressBar.displayName = 'ProgressBar';
