import * as React from 'react';
import { cn } from '@/lib/utils';

// Variants:
//   default — standard content card. Border + subtle shadow. radius=lg (16px).
//   hero    — premium feature card. Larger radius (20px), gradient overlay,
//             optional blue glow. Use on dashboards / welcome surfaces.
//   muted   — borderless flat card on a subtle surface. For inner panels
//             on a detail page where the outer Card already provides edge.
//
// Default behaviour is backward-compatible: existing <Card> call-sites
// keep their visual contract (now upgraded to the Phase 1 token shift —
// radius shifted 8→16px is the deliberate premium upgrade).

export type CardVariant = 'default' | 'hero' | 'muted';

const variantClass: Record<CardVariant, string> = {
  default: 'rounded-lg border bg-card text-card-foreground shadow-sm',
  hero:    'rounded-xl border bg-card text-card-foreground bg-gradient-card-hero shadow-glow-blue',
  muted:   'rounded-lg bg-surface-1 text-card-foreground',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(variantClass[variant], className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-base font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-muted-foreground text-sm', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
