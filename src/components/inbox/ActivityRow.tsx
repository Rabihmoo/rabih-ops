import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Calendar,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Mail,
  PhoneCall,
  Receipt,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import type {
  ActivityItem,
  ActivitySeverity,
  ActivitySource,
} from '@/lib/activity-inbox';
import type { Suggestion } from '@/lib/inbox-suggestions/types';
import { SuggestionStrip } from './SuggestionStrip';

// Sources whose entity_url points outside RabihOS — open in a new tab.
const EXTERNAL_SOURCES = new Set<ActivitySource>(['gmail', 'calendar']);

const SOURCE_LABEL: Record<ActivitySource, string> = {
  task: 'Task',
  follow_up: 'Follow-up',
  purchase: 'Purchase',
  inspection_finding: 'Finding',
  document: 'Document',
  gmail: 'Email',
  calendar: 'Calendar',
  telegram: 'Reminder',
};

const SOURCE_ICON: Record<ActivitySource, LucideIcon> = {
  task: ClipboardCheck,
  follow_up: PhoneCall,
  purchase: Receipt,
  inspection_finding: ShieldAlert,
  document: FileText,
  gmail: Mail,
  calendar: Calendar,
  telegram: Bell,
};

const SEVERITY_BAR: Record<ActivitySeverity, string> = {
  critical: 'bg-destructive',
  overdue: 'bg-destructive',
  due_today: 'bg-warning',
  soon: 'bg-primary',
  info: 'bg-border',
};

const SEVERITY_INK: Record<ActivitySeverity, string> = {
  critical: 'text-destructive-ink',
  overdue: 'text-destructive-ink',
  due_today: 'text-warning-ink',
  soon: 'text-primary-ink',
  info: 'text-muted-foreground',
};

function relativeWhen(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diffMin = Math.round((now.getTime() - t) / 60000);
  if (diffMin < -24 * 60) {
    const d = new Date(t);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (diffMin < 0) {
    const mins = -diffMin;
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    return `in ${Math.round(hrs / 24)}d`;
  }
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hrs = Math.round(diffMin / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days}d ago`;
  const d = new Date(t);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function BranchTag({ branch }: { branch: string | null }) {
  if (!branch) {
    return <span className="text-subtle-foreground">cross-branch</span>;
  }
  const meta = (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
    branch as BranchCode
  ];
  if (!meta) {
    return <span className="text-subtle-foreground">{branch}</span>;
  }
  return (
    <span className="text-foreground/85 inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.name}
    </span>
  );
}

export function ActivityRow({
  item,
  now = new Date(),
  suggestions = [],
  onDismissSuggestion,
}: {
  item: ActivityItem;
  now?: Date;
  suggestions?: Suggestion[];
  onDismissSuggestion?: (suggestionId: string) => void;
}) {
  const Icon = SOURCE_ICON[item.source];
  const external = EXTERNAL_SOURCES.has(item.source);
  const dueLabel = item.due_at
    ? relativeWhen(item.due_at, now)
    : relativeWhen(item.occurred_at, now);
  const dueTone = SEVERITY_INK[item.severity];
  const bar = SEVERITY_BAR[item.severity];

  const content = (
    <>
      <span aria-hidden className={cn('w-1 shrink-0 self-stretch rounded-l-md', bar)} />
      <div className="flex flex-1 items-center gap-3 px-3 py-2.5 min-w-0">
        <div className="flex shrink-0 items-center gap-1.5">
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              item.severity === 'critical' || item.severity === 'overdue'
                ? 'text-destructive'
                : item.severity === 'due_today'
                  ? 'text-warning'
                  : 'text-muted-foreground',
            )}
          />
          <span className="text-subtle-foreground hidden text-[10px] uppercase tracking-wider sm:inline">
            {SOURCE_LABEL[item.source]}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-foreground line-clamp-1 text-sm font-medium">
            {item.title}
          </div>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
            <BranchTag branch={item.branch} />
            {item.summary && (
              <>
                <span className="text-subtle-foreground">·</span>
                <span className="line-clamp-1">{item.summary}</span>
              </>
            )}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-xs font-medium tabular-nums',
            dueTone,
          )}
        >
          {dueLabel}
        </span>
        {external ? (
          <ExternalLink className="text-muted-foreground h-4 w-4 shrink-0" />
        ) : (
          <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
        )}
      </div>
    </>
  );

  const className =
    'hover:bg-surface-1 border-border flex items-stretch rounded-md border transition-colors';

  const rowLink = external ? (
    <a
      href={item.entity_url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-testid={`inbox-row-${item.source}`}
    >
      {content}
    </a>
  ) : (
    <Link
      to={item.entity_url}
      className={className}
      data-testid={`inbox-row-${item.source}`}
    >
      {content}
    </Link>
  );

  if (suggestions.length === 0 || !onDismissSuggestion) {
    return rowLink;
  }
  return (
    <div>
      {rowLink}
      <SuggestionStrip
        parentItem={item}
        suggestions={suggestions}
        onDismiss={onDismissSuggestion}
      />
    </div>
  );
}
