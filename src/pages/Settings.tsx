import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUserProfile, useSession } from '@/hooks/useAuth';
import { TelegramCard } from '@/components/settings/TelegramCard';
import { GoogleCalendarCard } from '@/components/settings/GoogleCalendarCard';

export function SettingsPage() {
  const { data: session } = useSession();
  const { data: profile } = useCurrentUserProfile();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Email" value={session?.user.email ?? '—'} />
          <Row label="Full name" value={profile?.full_name ?? '—'} />
          <Row label="Role" value={profile?.role ?? '—'} />
          <Row
            label="Branches"
            value={profile?.branches && profile.branches.length > 0 ? profile.branches.join(', ') : '—'}
          />
        </CardContent>
      </Card>
      <TelegramCard />
      <GoogleCalendarCard />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
