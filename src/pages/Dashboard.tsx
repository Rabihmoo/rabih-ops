import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useCurrentUserProfile, useSession } from '@/hooks/useAuth';
import { ListChecks, AlertTriangle, UserCheck } from 'lucide-react';

export function DashboardPage() {
  const { data: session } = useSession();
  const { data: profile } = useCurrentUserProfile();
  const displayName = profile?.full_name ?? session?.user.email?.split('@')[0] ?? 'there';

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {displayName}</h1>
        <p className="text-muted-foreground text-sm">
          Here's what needs your attention today.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <DashboardCard
          title="Today's Priorities"
          description="Urgent tasks and follow-ups due today"
          icon={<ListChecks className="text-primary h-5 w-5" />}
        />
        <DashboardCard
          title="Overdue"
          description="Items past their due date"
          icon={<AlertTriangle className="text-destructive h-5 w-5" />}
        />
        <DashboardCard
          title="Assigned to You"
          description="Tasks and follow-ups you own"
          icon={<UserCheck className="text-primary h-5 w-5" />}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Tasks, follow-ups, and inspections modules are being built out next.
      </p>
    </div>
  );
}

function DashboardCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">—</div>
        <CardDescription className="mt-1">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
