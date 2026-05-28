import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  PhoneCall,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RollupStat {
  label: string;
  count: number | null;
  isLoading: boolean;
  icon: LucideIcon;
  tone: 'destructive' | 'warning' | 'primary' | 'muted';
  to: string;
  onClick?: () => void;
}

export function TodayRollupRow({
  overdueCount,
  overdueLoading,
  followUpsTodayCount,
  followUpsTodayLoading,
  dueSoonCount,
  dueSoonLoading,
  waitingCount,
  waitingLoading,
  onOverdueClick,
  onFollowUpsClick,
  onDueSoonClick,
  onWaitingClick,
}: {
  overdueCount: number | null;
  overdueLoading: boolean;
  followUpsTodayCount: number | null;
  followUpsTodayLoading: boolean;
  dueSoonCount: number | null;
  dueSoonLoading: boolean;
  waitingCount: number | null;
  waitingLoading: boolean;
  onOverdueClick?: () => void;
  onFollowUpsClick?: () => void;
  onDueSoonClick?: () => void;
  onWaitingClick?: () => void;
}) {
  const stats: RollupStat[] = [
    {
      label: 'Overdue',
      count: overdueCount,
      isLoading: overdueLoading,
      icon: AlertTriangle,
      tone: (overdueCount ?? 0) > 0 ? 'destructive' : 'muted',
      to: '/tasks',
      onClick: onOverdueClick,
    },
    {
      label: 'Follow-ups today',
      count: followUpsTodayCount,
      isLoading: followUpsTodayLoading,
      icon: PhoneCall,
      tone: (followUpsTodayCount ?? 0) > 0 ? 'primary' : 'muted',
      to: '/follow-ups',
      onClick: onFollowUpsClick,
    },
    {
      label: 'Due soon',
      count: dueSoonCount,
      isLoading: dueSoonLoading,
      icon: CalendarClock,
      tone: (dueSoonCount ?? 0) > 0 ? 'warning' : 'muted',
      to: '/tasks',
      onClick: onDueSoonClick,
    },
    {
      label: 'Waiting',
      count: waitingCount,
      isLoading: waitingLoading,
      icon: Clock,
      tone: (waitingCount ?? 0) > 0 ? 'warning' : 'muted',
      to: '/tasks',
      onClick: onWaitingClick,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      data-testid="today-rollup-row"
    >
      {stats.map((s) => (
        <RollupCell key={s.label} stat={s} />
      ))}
    </div>
  );
}

const TONE_TEXT: Record<string, string> = {
  destructive: 'text-destructive-ink',
  warning: 'text-warning-ink',
  primary: 'text-primary-ink',
  muted: 'text-foreground-56',
};

function RollupCell({ stat }: { stat: RollupStat }) {
  const Icon = stat.icon;

  return (
    <Link
      to={stat.to}
      onClick={stat.onClick}
      data-testid={`rollup-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        'bg-card border-border hover:bg-surface-1 flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
      )}
    >
      <Icon
        className={cn('h-5 w-5 shrink-0', TONE_TEXT[stat.tone])}
        aria-hidden
      />
      <div className="min-w-0">
        <div
          className={cn(
            'text-lg font-semibold tabular-nums leading-tight',
            TONE_TEXT[stat.tone],
          )}
        >
          {stat.isLoading ? '—' : (stat.count ?? 0)}
        </div>
        <div className="text-foreground-56 truncate text-xs">{stat.label}</div>
      </div>
    </Link>
  );
}
