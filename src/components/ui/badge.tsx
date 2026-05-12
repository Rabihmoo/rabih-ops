import * as React from 'react';
import { cn } from '@/lib/utils';

// Neutral pill. For module tags, branch labels, count chips, etc.
// Use StatusChip when a severity colour is involved.

type BadgeSize = 'xs' | 'sm' | 'md';

const sizeClass: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: BadgeSize;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, size = 'sm', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 text-foreground-72 font-medium tracking-wide whitespace-nowrap',
        sizeClass[size],
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';
