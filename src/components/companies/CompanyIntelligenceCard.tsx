import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ClipboardCheck,
  ListChecks,
  PhoneCall,
  Receipt,
  FileText,
  NotebookPen,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { useRecordRelations } from '@/hooks/useRecordLinks';
import { useCanMutate } from '@/hooks/usePermissions';
import { relativeTime } from '@/lib/global-search';
import type { RecordRelation } from '@/lib/record-relations';
import {
  computeLastContacted,
  countOpenIssues,
  filterIssueHistory,
  filterOpen,
  recentTouches,
  totalTouchCount,
} from '@/lib/company-intelligence';

type FilterTab = 'all' | 'open' | 'issues';

const ENTITY_ICON: Record<string, LucideIcon> = {
  task: ListChecks,
  follow_up: PhoneCall,
  note: NotebookPen,
  document: FileText,
  purchase_request: Receipt,
  inspection: ClipboardCheck,
  company: Building2,
  contact: Users,
};

const ENTITY_LABEL: Record<string, string> = {
  task: 'Task',
  follow_up: 'Follow-up',
  note: 'Note',
  document: 'Document',
  purchase_request: 'Purchase',
  inspection: 'Inspection',
  company: 'Company',
  contact: 'Contact',
};

const ENTITY_PATH: Record<string, string> = {
  task: '/tasks',
  follow_up: '/follow-ups',
  purchase_request: '/purchases',
  inspection: '/inspections',
  document: '/documents',
  note: '/notes',
  company: '/companies',
  contact: '/contacts',
};

function rowHref(r: RecordRelation): string | null {
  if (!r.to_entity_type || !r.to_entity_id) return null;
  const base = ENTITY_PATH[r.to_entity_type];
  return base ? `${base}/${r.to_entity_id}` : null;
}

export function CompanyIntelligenceCard({
  companyId,
  companyName,
  companyBranch,
}: {
  companyId: string;
  companyName: string;
  companyBranch?: string | null;
}) {
  const { data: relations, isLoading } = useRecordRelations('company', companyId);
  const canMutate = useCanMutate();
  const [tab, setTab] = useState<FilterTab>('all');

  const rows = useMemo(() => relations ?? [], [relations]);

  const stats = useMemo(
    () => ({
      total: totalTouchCount(rows),
      openIssues: countOpenIssues(rows),
      lastContacted: computeLastContacted(rows),
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const base = recentTouches(rows, 20);
    if (tab === 'open') return filterOpen(base);
    if (tab === 'issues') return filterIssueHistory(base);
    return base;
  }, [rows, tab]);

  if (isLoading) return null;

  return (
    <Card data-testid="company-intelligence-card">
      <CardContent className="space-y-4 p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-section-label">Intelligence</div>
          <div className="flex gap-1">
            {(['all', 'open', 'issues'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                data-testid={`intel-tab-${t}`}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === t
                    ? 'bg-primary-soft text-primary-ink'
                    : 'text-foreground-56 hover:bg-surface-2 hover:text-foreground'
                }`}
              >
                {t === 'all' ? 'All' : t === 'open' ? 'Open' : 'Issues'}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        {rows.length > 0 && (
          <div className="border-border grid grid-cols-3 gap-3 rounded-lg border p-3">
            <StatCell label="Total touches" value={String(stats.total)} />
            <StatCell label="Open issues" value={String(stats.openIssues)} />
            <StatCell
              label="Last contacted"
              value={stats.lastContacted ? relativeTime(stats.lastContacted) : '—'}
            />
          </div>
        )}

        {/* Empty state */}
        {rows.length === 0 && (
          <EmptyState
            icon={Building2}
            title="No linked records yet"
            description="Link tasks, purchases, or inspections to build this company's profile."
            tone="muted"
            size="compact"
          />
        )}

        {/* Timeline */}
        {filtered.length > 0 && (
          <ul className="space-y-0.5" data-testid="intel-timeline">
            {filtered.map((r) => (
              <TimelineRow key={`${r.source_table}:${r.link_id}:${r.direction}`} row={r} />
            ))}
          </ul>
        )}

        {rows.length > 0 && filtered.length === 0 && tab !== 'all' && (
          <div className="text-muted-foreground py-3 text-center text-xs">
            {tab === 'open' ? 'No open items.' : 'No inspections or follow-ups linked.'}
          </div>
        )}

        {/* CTA */}
        {canMutate && (
          <Button size="sm" variant="outline" asChild data-testid="intel-add-purchase-cta">
            <Link
              to={`/purchases/new?supplier_name=${encodeURIComponent(companyName)}${companyBranch ? `&branch=${encodeURIComponent(companyBranch)}` : ''}`}
            >
              <Receipt className="mr-1 h-4 w-4" /> Add purchase from this supplier
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-foreground text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-foreground-56 text-[11px]">{label}</div>
    </div>
  );
}

function TimelineRow({ row }: { row: RecordRelation }) {
  const Icon = ENTITY_ICON[row.to_entity_type ?? ''] ?? Building2;
  const label =
    row.to_entity_title ??
    row.external_label ??
    ENTITY_LABEL[row.to_entity_type ?? ''] ??
    'Link';
  const href = rowHref(row);
  const inner = (
    <div className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-2">
      <Icon className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {row.to_entity_status && (
        <span className="text-foreground-56 shrink-0 text-xs">{row.to_entity_status}</span>
      )}
      <span className="text-foreground-40 shrink-0 text-xs">{relativeTime(row.created_at)}</span>
    </div>
  );

  return (
    <li>
      {href ? (
        <Link to={href} className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}
