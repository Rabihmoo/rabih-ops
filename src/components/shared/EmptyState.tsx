import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared empty-state used across list views, dashboard "all clear", and any
// other "nothing here" surface. Centered icon container + headline + subtle
// description + optional action slot.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'muted',
  size = 'default',
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: 'muted' | 'success' | 'warning' | 'primary';
  size?: 'compact' | 'default' | 'tall';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 px-6 text-center',
        size === 'compact' && 'py-8',
        size === 'default' && 'py-14',
        size === 'tall' && 'py-20',
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full ring-1',
            tone === 'success' &&
              'bg-success-soft text-success-ink ring-success/20',
            tone === 'warning' &&
              'bg-warning-soft text-warning-ink ring-warning/20',
            tone === 'primary' &&
              'bg-primary-soft text-primary-ink ring-primary/20',
            tone === 'muted' &&
              'bg-surface-2 text-muted-foreground ring-border-strong',
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="space-y-1.5">
        <div className="text-foreground text-base font-semibold tracking-tight">
          {title}
        </div>
        {description && (
          <div className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed">
            {description}
          </div>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
