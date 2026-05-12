import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      // Font stack falls back to system fonts. Inter / Geist can be loaded
      // locally later (npm or self-hosted) — we deliberately avoid Google
      // Fonts to keep render predictable and external deps zero.
      fontFamily: {
        sans: [
          'Inter',
          'Geist',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      colors: {
        border: 'hsl(var(--border))',
        'border-strong': 'hsl(var(--border-strong))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // Foreground opacity scale: 72 / 56 / 40. Use on body text to
        // establish hierarchy without re-declaring colours.
        'foreground-72': 'hsl(var(--foreground-72))',
        'foreground-56': 'hsl(var(--foreground-56))',
        'foreground-40': 'hsl(var(--foreground-40))',
        'subtle-foreground': 'hsl(var(--subtle-foreground))',
        // Elevation steps above background. Four levels — use sparingly;
        // most cards should sit on surface-1 or surface-2.
        'surface-1': 'hsl(var(--surface-1))',
        'surface-2': 'hsl(var(--surface-2))',
        'surface-3': 'hsl(var(--surface-3))',
        'surface-4': 'hsl(var(--surface-4))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          // bg-primary-soft = transparent blue, for active nav etc.
          soft: 'hsl(var(--primary) / 0.14)',
          // text-primary-ink = brighter blue text on bg-primary-soft.
          ink: 'hsl(var(--primary-ink))',
          // Brighter blue used for glow halos on near-black dark mode.
          glow: 'hsl(var(--glow-blue))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          ink: 'hsl(var(--accent-ink))',
          soft: 'hsl(var(--accent) / 0.16)',
          glow: 'hsl(var(--glow-amber))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          soft: 'hsl(var(--destructive) / 0.14)',
          ink: 'hsl(var(--destructive-ink))',
          glow: 'hsl(var(--glow-destructive))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          soft: 'hsl(var(--warning) / 0.14)',
          ink: 'hsl(var(--warning-ink))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          soft: 'hsl(var(--success) / 0.14)',
          ink: 'hsl(var(--success-ink))',
          glow: 'hsl(var(--glow-success))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Branch palette — refined for OLED dark visibility.
        // Deliberately separate from `--primary` so `branch.salt` (#3b82f6)
        // can diverge from the system primary if the brand changes.
        branch: {
          bbqhouse: '#f97316',
          salt: '#3b82f6',
          centralkitchen: '#22c55e',
          cleaning: '#94a3b8',
        },
      },
      borderRadius: {
        // Premium radius scale — default (md) is 12px, big radii are
        // opt-in. Components reading `rounded-md` shift from 6px → 12px;
        // `rounded-lg` from 8px → 16px. Intentional visual upgrade.
        xs:    'var(--radius-xs)',  /*  6px */
        sm:    'var(--radius-sm)',  /*  8px */
        md:    'var(--radius)',     /* 12px — default */
        lg:    'var(--radius-lg)',  /* 16px — content cards */
        xl:    'var(--radius-xl)',  /* 20px — hero cards */
        '2xl': 'var(--radius-2xl)', /* 24px — login / ambient */
        pill:  '9999px',
      },
      boxShadow: {
        // Dark-tuned shadows for things that float over the OLED base.
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.4)',
        DEFAULT:
          '0 4px 8px -2px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.3)',
        md: '0 4px 8px -2px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.3)',
        lg: '0 12px 24px -6px rgb(0 0 0 / 0.6), 0 4px 8px -4px rgb(0 0 0 / 0.4)',
        // Warm Studio shadows for light-mode cards. Tinted warm-brown so
        // elevation reads against the off-white background instead of
        // looking like dirty grey.
        'warm-sm': '0 1px 2px 0 rgb(120 90 40 / 0.06), 0 1px 1px 0 rgb(120 90 40 / 0.04)',
        warm:     '0 4px 12px -4px rgb(120 90 40 / 0.10), 0 2px 4px -2px rgb(120 90 40 / 0.06)',
        'warm-lg':'0 20px 40px -12px rgb(120 90 40 / 0.14), 0 4px 8px -4px rgb(120 90 40 / 0.08)',
        // Glow shadows — opt-in via shadow-glow-* OR the .glow-* utilities
        // in index.css. Use ONLY on hero / active states.
        'glow-blue':
          '0 0 0 1px hsl(var(--glow-blue) / 0.15), 0 8px 32px -8px hsl(var(--glow-blue) / 0.35)',
        'glow-amber':
          '0 0 0 1px hsl(var(--glow-amber) / 0.18), 0 8px 32px -8px hsl(var(--glow-amber) / 0.30)',
        'glow-success':
          '0 0 0 1px hsl(var(--glow-success) / 0.18), 0 8px 32px -8px hsl(var(--glow-success) / 0.30)',
        'glow-destructive':
          '0 0 0 1px hsl(var(--glow-destructive) / 0.18), 0 8px 32px -8px hsl(var(--glow-destructive) / 0.30)',
      },
      backgroundImage: {
        // Ambient gradients — also available as the .bg-ambient-{dark,light}
        // utilities in index.css. Use only on hero / login / empty-state
        // surfaces; never on dense operational pages.
        'gradient-ambient-dark':
          'radial-gradient(80% 50% at 50% -10%, hsl(217 91% 60% / 0.10), transparent 60%), radial-gradient(60% 40% at 100% 100%, hsl(217 91% 60% / 0.05), transparent 60%)',
        'gradient-ambient-light':
          'radial-gradient(80% 50% at 50% -10%, hsl(43 96% 56% / 0.08), transparent 60%), radial-gradient(60% 40% at 100% 100%, hsl(221 83% 53% / 0.05), transparent 60%)',
        // Subtle card-hero overlay — use as an extra layer on a hero card
        // for that "premium gradient" look without changing the base bg.
        'gradient-card-hero':
          'linear-gradient(135deg, hsl(var(--surface-2)) 0%, hsl(var(--surface-1)) 100%)',
        // Primary CTA gradient — for the main login / hero button.
        'gradient-primary':
          'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary-hover)) 100%)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // Slow ambient drift for radial-gradient backgrounds.
        'ambient-drift': {
          '0%, 100%': { transform: 'translate(0, 0)', opacity: '0.6' },
          '50%':      { transform: 'translate(2%, -1%)', opacity: '0.9' },
        },
        // Skeleton shimmer.
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Page / card enter animation.
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'ambient-drift':  'ambient-drift 18s ease-in-out infinite',
        shimmer:          'shimmer 2.4s linear infinite',
        'fade-in-up':     'fade-in-up 240ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
