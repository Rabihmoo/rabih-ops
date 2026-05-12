import { LogOut } from 'lucide-react';
import { useCurrentUserProfile, useSession, signOut } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  ceo: 'CEO',
  manager: 'Manager',
  viewer: 'Viewer',
};

export function TopBar() {
  const { data: session } = useSession();
  const { data: profile } = useCurrentUserProfile();
  const displayName = profile?.full_name ?? session?.user.email ?? '';
  const roleBadge = profile?.role ? ROLE_LABEL[profile.role] ?? profile.role : null;

  return (
    <header className="bg-surface-1 border-border sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 md:px-6">
      {/* Mobile-only wordmark */}
      <div className="text-foreground text-base font-semibold tracking-tight md:hidden">
        RabihOS
      </div>

      {/* Desktop identity strip */}
      <div className="hidden items-center gap-2 text-sm md:flex">
        {displayName ? (
          <>
            <span className="text-muted-foreground">Signed in as</span>
            <span className="text-foreground font-medium">{displayName}</span>
            {roleBadge ? (
              <span className="bg-primary-soft text-primary-ink ml-1 inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                {roleBadge}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <Button variant="ghost" size="sm" onClick={() => void signOut()}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </Button>
    </header>
  );
}
