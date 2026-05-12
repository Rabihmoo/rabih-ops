import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { useCurrentUserProfile, useSession } from '@/hooks/useAuth';
import { TelegramCard } from '@/components/settings/TelegramCard';
import { GoogleCalendarCard } from '@/components/settings/GoogleCalendarCard';
import { GmailCard } from '@/components/settings/GmailCard';

const ROLE_CHIP: Record<string, { label: string; tone: StatusTone }> = {
  admin:   { label: 'Admin',   tone: 'info' },
  ceo:     { label: 'CEO',     tone: 'info' },
  manager: { label: 'Manager', tone: 'muted' },
  viewer:  { label: 'Viewer',  tone: 'muted' },
};

export function SettingsPage() {
  const { data: session } = useSession();
  const { data: profile } = useCurrentUserProfile();
  const displayName = profile?.full_name ?? session?.user.email ?? '—';
  const roleChip = profile?.role ? ROLE_CHIP[profile.role] : undefined;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {/* Profile reads as the page's hero card — the gradient overlay + soft
          glow signal "this is you" without dominating the rest of the page. */}
      <Card variant="hero">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center gap-4">
            <Avatar name={displayName} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-foreground truncate text-base font-semibold">
                {displayName}
              </div>
              {session?.user.email && displayName !== session.user.email && (
                <div className="text-foreground-56 truncate text-xs">
                  {session.user.email}
                </div>
              )}
              {roleChip && (
                <div className="mt-1.5">
                  <StatusChip tone={roleChip.tone} size="xs">
                    {roleChip.label}
                  </StatusChip>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-0">
            <Row label="Email" value={session?.user.email ?? '—'} />
            <Row
              label="Branches"
              value={
                profile?.branches && profile.branches.length > 0
                  ? profile.branches.join(', ')
                  : 'All (admin scope)'
              }
            />
          </div>
        </CardContent>
      </Card>

      <TelegramCard />
      <GoogleCalendarCard />
      <GmailCard />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/60 flex items-center justify-between border-b py-2 last:border-0">
      <span className="text-foreground-72">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}
