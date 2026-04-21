import { LogOut } from 'lucide-react';
import { useCurrentUserProfile, useSession, signOut } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { MobileNav } from './Sidebar';

export function TopBar() {
  const { data: session } = useSession();
  const { data: profile } = useCurrentUserProfile();
  const displayName = profile?.full_name ?? session?.user.email ?? '';

  return (
    <>
      <header className="bg-card/60 border-border sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur md:px-6">
        <div className="text-sm font-medium md:hidden">Rabih Ops</div>
        <div className="text-muted-foreground hidden text-sm md:block">
          {displayName ? <>Signed in as <span className="text-foreground">{displayName}</span></> : null}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </header>
      <MobileNav />
    </>
  );
}
