import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared empty-state used across list views, dashboard "all clear", and any
// other "nothing here" surface. Centered icon container + headline + subtle
// description + optional action slot.
//
// Phase 2.2 — adds `tone="hero"` for login / large welcome empty states.
// The hero variant uses a bigger icon container with a soft glow and
// slightly larger heading. Existing 'muted'/'success'/'warning'/'primary'
// tones are unchanged, including their colour and ring treatment.

type EmptyStateTone = 'muted' | 'success' | 'warning' | 'primary' | 'hero';
type EmptyStateSize = 'compact' | 'default' | 'tall';

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
  tone?: EmptyStateTone;
  size?: EmptyStateSize;
  className?: string;
}) {
  const isHero = tone === 'hero';

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
            'flex items-center justify-center rounded-full ring-1',
            isHero ? 'h-20 w-20 shadow-glow-blue' : 'h-14 w-14',
            tone === 'success' && 'bg-success-soft text-success-ink ring-success/20',
            tone === 'warning' && 'bg-warning-soft text-warning-ink ring-warning/20',
            tone === 'primary' && 'bg-primary-soft text-primary-ink ring-primary/20',
            tone === 'muted' &&
              'bg-surface-2 text-muted-foreground ring-border-strong',
            tone === 'hero' &&
              'bg-primary-soft text-primary-ink ring-primary/30',
          )}
        >
          <Icon className={cn(isHero ? 'h-9 w-9' : 'h-6 w-6')} />
        </div>
      )}
      <div className="space-y-1.5">
        <div
          className={cn(
            'text-foreground font-semibold tracking-tight',
            isHero ? 'text-2xl' : 'text-base',
          )}
        >
          {title}
        </div>
        {description && (
          <div
            className={cn(
              'text-muted-foreground mx-auto max-w-md leading-relaxed',
              isHero ? 'text-base' : 'text-sm',
            )}
          >
            {description}
          </div>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
