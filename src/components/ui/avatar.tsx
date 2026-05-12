import * as React from 'react';
import { cn } from '@/lib/utils';

// Initials-based avatar with optional image fallback.
// AvatarGroup overlaps multiple avatars and shows "+N" overflow.

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
export type AvatarTone = 'primary' | 'neutral';

const sizeClass: Record<AvatarSize, string> = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-[11px]',
  lg: 'h-10 w-10 text-xs',
};

const toneClass: Record<AvatarTone, string> = {
  primary: 'bg-primary-soft text-primary-ink',
  neutral: 'bg-surface-2 text-muted-foreground',
};

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export interface AvatarProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  name: string;
  src?: string;
  size?: AvatarSize;
  tone?: AvatarTone;
  /** Used by AvatarGroup to add a ring matching the parent background. */
  withRing?: boolean;
}

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ name, src, size = 'md', tone = 'primary', withRing, className, ...props }, ref) => {
    const [errored, setErrored] = React.useState(false);
    const initials = deriveInitials(name) || '?';
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center overflow-hidden rounded-pill font-semibold select-none',
          sizeClass[size],
          toneClass[tone],
          withRing && 'ring-2 ring-background',
          className,
        )}
        aria-label={name}
        {...props}
      >
        {src && !errored ? (
          <img
            src={src}
            alt={name}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        ) : (
          <span>{initials}</span>
        )}
      </span>
    );
  },
);
Avatar.displayName = 'Avatar';

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hard cap on rendered avatars; remainder collapsed into a "+N" tile. */
  max?: number;
  size?: AvatarSize;
  tone?: AvatarTone;
}

export const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ max = 4, size = 'md', tone = 'primary', children, className, ...props }, ref) => {
    const items = React.Children.toArray(children).filter((c) => React.isValidElement(c));
    const visible = items.slice(0, max);
    const overflow = items.length - visible.length;
    return (
      <div
        ref={ref}
        className={cn('flex items-center -space-x-2', className)}
        {...props}
      >
        {visible.map((child, idx) =>
          React.cloneElement(child as React.ReactElement<AvatarProps>, {
            key: idx,
            withRing: true,
            size: (child as React.ReactElement<AvatarProps>).props.size ?? size,
            tone: (child as React.ReactElement<AvatarProps>).props.tone ?? tone,
          }),
        )}
        {overflow > 0 && (
          <span
            className={cn(
              'inline-flex items-center justify-center overflow-hidden rounded-pill font-semibold ring-2 ring-background bg-surface-3 text-foreground-72',
              sizeClass[size],
            )}
            aria-label={`+${overflow} more`}
          >
            +{overflow}
          </span>
        )}
      </div>
    );
  },
);
AvatarGroup.displayName = 'AvatarGroup';
