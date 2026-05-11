import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import { COMPANY_CATEGORY_LABEL, type CompanyListItem as Item } from '@/lib/companies';
import type { CompanyCategory } from '@/types/database';

export function CompanyListItem({ company }: { company: Item }) {
  const archived = !company.active;

  return (
    <Link
      to={`/companies/${company.id}`}
      data-testid="company-list-item"
      className={cn(
        'group border-border bg-card hover:bg-surface-1 relative flex w-full items-stretch border-b text-left transition-colors',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'w-1 shrink-0 self-stretch',
          archived ? 'bg-transparent' : 'bg-primary',
        )}
      />
      <div className="flex flex-1 items-center gap-3 px-4 py-3 min-w-0">
        <Building2
          className={cn('h-4 w-4 shrink-0', archived ? 'text-muted-foreground' : 'text-primary')}
        />
        <div className="min-w-0 flex-1">
          <div className="text-foreground line-clamp-1 text-sm font-medium">
            {company.name}
            {archived && (
              <span className="text-subtle-foreground ml-2 text-[10px] uppercase tracking-wider">
                archived
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-foreground/85">
              {COMPANY_CATEGORY_LABEL[company.category as CompanyCategory]}
            </span>
            {company.branches.length === 0 ? (
              <span className="text-subtle-foreground">· admin only</span>
            ) : (
              company.branches.map((b) => {
                const meta = (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
                  b as BranchCode
                ];
                if (!meta) return null;
                return (
                  <span key={b} className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    {meta.name}
                  </span>
                );
              })
            )}
          </div>
        </div>
        <span className="text-subtle-foreground inline-flex items-center gap-1 text-xs tabular-nums">
          <Users className="h-3 w-3" />
          {company.contact_count}
        </span>
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
      </div>
    </Link>
  );
}
