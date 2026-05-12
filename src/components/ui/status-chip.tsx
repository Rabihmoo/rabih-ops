import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Severity-coloured pill. Maps a semantic tone to its `*-soft` background
// + `*-ink` text colour (defined in Phase 1 tokens). Optional leading
// icon OR small coloured dot.
//
// Tones:
//   critical    — red, for findings / overdue work
//   warning     — amber, for due-today / soon-overdue
//   success     — green, for healthy / completed
//   info        — blue, for active / informational
//   muted       — neutral, for archived / inactive
//   purple      — violet, for automation / special states
// The first five use Phase 1 tokens; purple uses Tailwind's built-in
// violet palette to avoid adding a global token before there are
// multiple callers.

export type StatusTone =
  | 'critical'
  | 'warning'
  | 'success'
  | 'info'
  | 'muted'
  | 'purple';

type StatusSize = 'xs' | 'sm' | 'md';

const sizeClass: Record<StatusSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

const toneClass: Record<StatusTone, { bg: string; text: string; dot: string }> = {
  critical: {
    bg:   'bg-destructive-soft',
    text: 'text-destructive-ink',
    dot:  'bg-destructive',
  },
  warning: {
    bg:   'bg-warning-soft',
    text: 'text-warning-ink',
    dot:  'bg-warning',
  },
  success: {
    bg:   'bg-success-soft',
    text: 'text-success-ink',
    dot:  'bg-success',
  },
  info: {
    bg:   'bg-primary-soft',
    text: 'text-primary-ink',
    dot:  'bg-primary',
  },
  muted: {
    bg:   'bg-surface-2',
    text: 'text-muted-foreground',
    dot:  'bg-muted-foreground',
  },
  purple: {
    bg:   'bg-violet-500/14',
    text: 'text-violet-300 dark:text-violet-300',
    dot:  'bg-violet-500',
  },
};

export interface StatusChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone: StatusTone;
  size?: StatusSize;
  icon?: LucideIcon;
  dot?: boolean;
  children: React.ReactNode;
}

export const StatusChip = React.forwardRef<HTMLSpanElement, StatusChipProps>(
  ({ tone, size = 'sm', icon: Icon, dot = false, className, children, ...props }, ref) => {
    const t = toneClass[tone];
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-pill font-semibold tracking-wide uppercase whitespace-nowrap',
          sizeClass[size],
          t.bg,
          t.text,
          className,
        )}
        {...props}
      >
        {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
        {!Icon && dot && (
          <span
            aria-hidden
            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', t.dot)}
          />
        )}
        {children}
      </span>
    );
  },
);
StatusChip.displayName = 'StatusChip';
