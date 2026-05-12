import * as React from 'react';
import { cn } from '@/lib/utils';

// Wrapper that paints the radial-gradient ambient layer behind its
// content. Light mode gets the warm Studio gradient, dark mode the
// OLED blue glow — both opted into via the Phase 1 utility classes
// (`.bg-ambient-light` / `.bg-ambient-dark`).
//
// Use on:
//   - login screen
//   - hero / welcome cards
//   - large empty states
// NEVER on dense operational pages — the gradient kills scannability.
//
// `intensity` controls how strong the gradient reads. We dim it via
// an overlay opacity instead of recomputing CSS variables so the
// component stays pure-presentational. CSS-only, no motion library.

export type AmbientIntensity = 'subtle' | 'default' | 'strong';

const intensityClass: Record<AmbientIntensity, string> = {
  // The overlay sits ABOVE the ambient layer and blends towards background
  // colour. Higher opacity = more washout = subtler gradient.
  subtle:  'bg-background/55',
  default: 'bg-background/25',
  strong:  'bg-background/0',
};

export interface AmbientBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: AmbientIntensity;
}

export const AmbientBackground = React.forwardRef<HTMLDivElement, AmbientBackgroundProps>(
  ({ intensity = 'subtle', className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative isolate bg-ambient-light dark:bg-ambient-dark',
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className={cn('absolute inset-0 -z-10 pointer-events-none', intensityClass[intensity])}
      />
      {children}
    </div>
  ),
);
AmbientBackground.displayName = 'AmbientBackground';
