// Internal design-system preview page. Dev-only — see App.tsx where
// the route is gated by import.meta.env.DEV. Never reachable in a
// production build.
//
// Renders every Phase 2 primitive + refit Card / Button / EmptyState
// in both themes so the operator can visually QA the system without
// touching production pages. Static fixtures only — no RPC calls.

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  ListChecks,
  Loader2,
  Mail,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusChip } from '@/components/ui/status-chip';
import { Avatar, AvatarGroup } from '@/components/ui/avatar';
import { ProgressBar } from '@/components/ui/progress-bar';
import { DashboardTile } from '@/components/ui/dashboard-tile';
import { AmbientBackground } from '@/components/ui/ambient-background';
import { SearchInput } from '@/components/ui/search-input';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader, HeaderStat } from '@/components/shared/PageHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

// -------------------------------------------------------------------
// Local theme override. The app forces .dark on <html>; this toggle
// flips it on the fly so the preview page can demonstrate both themes
// side-by-side without persisting (the real theme toggle ships in
// Phase 3). On unmount the original class is restored.
// -------------------------------------------------------------------
function useLocalThemeOverride() {
  const [mode, setMode] = useState<'dark' | 'light'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    if (mode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    return () => {
      if (wasDark) root.classList.add('dark');
      else root.classList.remove('dark');
    };
  }, [mode]);
  return { mode, setMode };
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-foreground text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      <div className="bg-surface-1 border-border rounded-lg border p-5">{children}</div>
    </section>
  );
}

// Static fixtures for CommandPalette dev-only preview.
const STATIC_SEARCH_RESULTS: import('@/lib/global-search').SearchResultRow[] = [
  { id: '1', type: 'task', title: 'Restock charcoal bags', branch: 'bbqhouse', updated_at: new Date(Date.now() - 3600_000).toISOString(), href: '/tasks/1' },
  { id: '2', type: 'follow_up', title: 'Call SALT refrigerator supplier', branch: 'salt', updated_at: new Date(Date.now() - 7200_000).toISOString(), href: '/follow-ups/2' },
  { id: '3', type: 'document', title: 'Health inspection certificate 2026', branch: 'centralkitchen', updated_at: new Date(Date.now() - 86400_000).toISOString(), href: '/documents/3' },
  { id: '4', type: 'company', title: 'Al Amin Supplies', branch: null, updated_at: new Date(Date.now() - 172800_000).toISOString(), href: '/companies/4' },
];

const STATIC_RECENTS: import('@/lib/global-search').SearchResultRow[] = [
  STATIC_SEARCH_RESULTS[0],
  STATIC_SEARCH_RESULTS[2],
];

export function DesignPreviewPage() {
  const { mode, setMode } = useLocalThemeOverride();
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="space-y-8 pb-16">
      {/* Sticky in-page theme toggle. Dev-only — production has the
          real theme toggle in the app shell (Phase 3). */}
      <header className="sticky top-0 z-10 -mx-4 px-4 py-3 backdrop-blur-md bg-background/70 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-section-label text-primary-ink/80">Internal</div>
            <h1 className="text-foreground text-2xl font-semibold tracking-tight leading-tight">
              Design preview · dev only
            </h1>
            <p className="text-muted-foreground text-xs">
              Static fixtures. Not reachable in production builds. Use the
              toggle to flip themes — change isn't persisted.
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-pill border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setMode('dark')}
              data-testid="design-preview-theme-dark"
              className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'dark'
                  ? 'bg-primary-soft text-primary-ink'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => setMode('light')}
              data-testid="design-preview-theme-light"
              className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'light'
                  ? 'bg-primary-soft text-primary-ink'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Light
            </button>
          </div>
        </div>
      </header>

      {/* PageHeader + HeaderStat — the polished spacing in action. */}
      <Section title="PageHeader" description="Spacing polish from Phase 2.2.">
        <PageHeader
          eyebrow="Operations"
          title="Tasks"
          actions={
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> New task
            </Button>
          }
          stats={
            <>
              <HeaderStat count={3} label="overdue" tone="destructive" />
              <HeaderStat count={7} label="due today" tone="warning" />
              <HeaderStat count={12} label="active" tone="primary" />
            </>
          }
        />
      </Section>

      {/* Cards — three variants */}
      <Section title="Card variants">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Default</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Border + subtle shadow. The standard surface across the app.
              </p>
            </CardContent>
          </Card>
          <Card variant="hero">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="text-primary h-4 w-4" /> Hero
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Gradient overlay + blue glow halo. Reserve for premium /
                hero surfaces — never for dense lists.
              </p>
            </CardContent>
          </Card>
          <Card variant="muted">
            <CardHeader>
              <CardTitle>Muted</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Borderless flat panel on surface-1. For inner sections
                inside an already-bordered outer card.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Buttons — every variant + size */}
      <Section title="Buttons" description="All variants × sizes. Press feedback is shared.">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Default</Button>
            <Button variant="gradient">Gradient</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Add"><Plus className="h-4 w-4" /></Button>
            <Button disabled>Disabled</Button>
            <Button variant="gradient" disabled>Disabled gradient</Button>
          </div>
        </div>
      </Section>

      {/* Badges + StatusChips */}
      <Section title="Badges & status chips">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="xs">XS Badge</Badge>
            <Badge size="sm">SM Badge</Badge>
            <Badge size="md">MD Badge</Badge>
            <Badge>operations</Badge>
            <Badge>finance</Badge>
            <Badge>supplier</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="critical" dot>Critical</StatusChip>
            <StatusChip tone="warning"  dot>Due today</StatusChip>
            <StatusChip tone="success"  dot>Done</StatusChip>
            <StatusChip tone="info"     dot>Active</StatusChip>
            <StatusChip tone="muted"    dot>Archived</StatusChip>
            <StatusChip tone="purple"   dot>Automated</StatusChip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="critical" icon={ShieldAlert}>2 critical</StatusChip>
            <StatusChip tone="warning"  icon={AlertTriangle}>Overdue</StatusChip>
            <StatusChip tone="success"  icon={CheckCircle2}>Completed</StatusChip>
          </div>
        </div>
      </Section>

      {/* Avatars + Group */}
      <Section title="Avatars">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <Avatar name="Rabih Moughabat" size="xs" />
            <Avatar name="Rabih Moughabat" size="sm" />
            <Avatar name="Rabih Moughabat" size="md" />
            <Avatar name="Rabih Moughabat" size="lg" />
          </div>
          <div className="flex items-center gap-6">
            <AvatarGroup>
              <Avatar name="Rabih Moughabat" />
              <Avatar name="Manuel Mota" tone="neutral" />
              <Avatar name="Acme Foods" />
            </AvatarGroup>
            <AvatarGroup max={3}>
              <Avatar name="A B" />
              <Avatar name="C D" />
              <Avatar name="E F" />
              <Avatar name="G H" />
              <Avatar name="I J" />
              <Avatar name="K L" />
            </AvatarGroup>
          </div>
        </div>
      </Section>

      {/* Progress bars */}
      <Section title="Progress bars">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ProgressBar value={28} tone="primary"     showLabel />
          <ProgressBar value={62} tone="success"     showLabel />
          <ProgressBar value={84} tone="warning"     showLabel />
          <ProgressBar value={95} tone="destructive" showLabel />
          <ProgressBar value={40} tone="primary"     size="sm" />
          <ProgressBar value={70} tone="success"     size="sm" />
        </div>
      </Section>

      {/* DashboardTile — 5 tones */}
      <Section
        title="DashboardTile"
        description="Premium KPI tile. Glow auto-resolves to (count > 0 && tone !== muted)."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <DashboardTile label="Critical findings" tone="destructive" icon={ShieldAlert}    count={3}    to="/inspections" />
          <DashboardTile label="Overdue"           tone="destructive" icon={AlertTriangle}  count={7}    to="/tasks" />
          <DashboardTile label="Today"             tone="warning"     icon={ListChecks}     count={12}   to="/tasks" />
          <DashboardTile label="Reminders"         tone="primary"     icon={Bell}           count={4}    to="/" />
          <DashboardTile label="Completed"         tone="success"     icon={CheckCircle2}   count={42}   to="/tasks" />
          <DashboardTile label="Archived"          tone="muted"       icon={ClipboardCheck} count={0}    to="/tasks" />
          <DashboardTile label="Loading"           tone="primary"     icon={Inbox}          count={null} isLoading to="/" />
        </div>
      </Section>

      {/* AmbientBackground — three intensities */}
      <Section title="AmbientBackground" description="Wrapper for hero / login / empty surfaces only.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(['subtle', 'default', 'strong'] as const).map((intensity) => (
            <AmbientBackground key={intensity} intensity={intensity} className="overflow-hidden rounded-xl">
              <div className="flex h-40 flex-col items-center justify-center gap-1 px-4 text-center">
                <Sparkles className="text-primary mb-1 h-6 w-6" />
                <div className="text-foreground text-base font-semibold">{intensity}</div>
                <div className="text-muted-foreground text-xs">
                  {intensity === 'subtle' && 'Default — barely-there glow.'}
                  {intensity === 'default' && 'Moderate — for empty states.'}
                  {intensity === 'strong' && 'Strong — for login hero only.'}
                </div>
              </div>
            </AmbientBackground>
          ))}
        </div>
      </Section>

      {/* EmptyState — hero + existing tones */}
      <Section title="EmptyState · tones">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card variant="muted">
            <CardContent className="p-0">
              <EmptyState
                icon={Inbox}
                tone="muted"
                title="Inbox zero."
                description="Nothing waiting for you."
              />
            </CardContent>
          </Card>
          <Card variant="muted">
            <CardContent className="p-0">
              <EmptyState
                icon={ShieldCheck}
                tone="success"
                title="All clear."
                description="No critical findings open."
              />
            </CardContent>
          </Card>
          <Card variant="muted">
            <CardContent className="p-0">
              <EmptyState
                icon={Building2}
                tone="primary"
                title="No companies yet"
                description="Add suppliers and contractors."
                action={
                  <Button size="sm">
                    <Plus className="mr-1 h-4 w-4" /> New company
                  </Button>
                }
              />
            </CardContent>
          </Card>
          <AmbientBackground intensity="default" className="overflow-hidden rounded-xl">
            <EmptyState
              icon={Sparkles}
              tone="hero"
              size="tall"
              title="Welcome to RabihOS"
              description="Your operations command center. Today's work appears here."
              action={
                <Button variant="gradient" size="lg">
                  Get started
                </Button>
              }
            />
          </AmbientBackground>
        </div>
      </Section>

      {/* Inline preview of source-style chips around an icon */}
      <Section title="Composite — task row preview" description="StatusChip + Avatar + Badge composition.">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="text-primary h-4 w-4" />
                <h3 className="text-foreground font-medium">
                  Renew gas cylinder contract for SALT branch
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusChip tone="critical" dot>Overdue</StatusChip>
                <Badge>operations</Badge>
                <Badge>salt</Badge>
                <StatusChip tone="purple" dot>Auto</StatusChip>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <AvatarGroup max={3}>
                <Avatar name="Rabih Moughabat" />
                <Avatar name="Manuel Mota" />
                <Avatar name="Acme Foods" />
              </AvatarGroup>
              <span className="text-muted-foreground text-xs tabular-nums">2d ago</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
            <span className="text-muted-foreground text-xs">Progress 64%</span>
            <div className="flex-1">
              <ProgressBar value={64} tone="primary" size="sm" />
            </div>
          </div>
        </div>
      </Section>

      {/* Phase 3 shell elements. The full app shell — sidebar, topbar,
          mobile bottom nav, drawer — wraps this page; these previews are
          the constituent UI primitives in isolation for visual QA. */}
      <Section
        title="Shell elements"
        description="Phase 3 shell primitives. The live shell wraps this page."
      >
        <div className="space-y-5">
          <div>
            <div className="text-section-label mb-2">SearchInput</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SearchInput
                aria-label="Search demo"
                placeholder="Search tasks, contacts, documents…"
              />
              <SearchInput
                aria-label="Search demo with kbd"
                placeholder="With keyboard hint"
                kbdHint="⌘K"
              />
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Cosmetic in Phase 3 — readOnly in the topbar until the command
              palette lands in Phase 4. The ⌘K hint is decorative for now.
            </p>
          </div>

          <div>
            <div className="text-section-label mb-2">ThemeToggle</div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <span className="text-muted-foreground text-sm">
                Persists to <code className="text-xs">localStorage</code>; the
                in-page toggle above this section is dev-only and does not
                persist.
              </span>
            </div>
          </div>

          <div>
            <div className="text-section-label mb-2">Mobile shell</div>
            <p className="text-muted-foreground text-sm">
              The mobile bottom nav (Home / Inbox / Tasks / Follow-ups / More)
              and the secondary drawer are visible at the <code>md</code> breakpoint
              and below — resize the viewport to see them. Drawer holds
              Fixed tasks, Inspections, Purchasing, Documents, Directory,
              Settings, the user identity strip, the theme toggle, branches
              legend, and Sign out.
            </p>
          </div>
        </div>
      </Section>

      {/* Command Palette (Phase 3) */}
      <Section title="Command Palette" description="Cmd-K search palette. Click Open to preview with static fixtures.">
        <Button onClick={() => setPaletteOpen(true)}>Open palette</Button>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          devResults={STATIC_SEARCH_RESULTS}
          devRecents={STATIC_RECENTS}
        />
      </Section>
    </div>
  );
}
