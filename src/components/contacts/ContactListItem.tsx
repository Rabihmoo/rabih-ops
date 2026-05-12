import { Link } from 'react-router-dom';
import { ChevronRight, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import { Avatar } from '@/components/ui/avatar';
import { StatusChip } from '@/components/ui/status-chip';
import type { ContactListItem as Item } from '@/lib/contacts';

export function ContactListItem({ contact }: { contact: Item }) {
  const archived = !contact.active;

  return (
    <Link
      to={`/contacts/${contact.id}`}
      data-testid="contact-list-item"
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
        <Avatar
          name={contact.full_name}
          size="md"
          tone={archived ? 'neutral' : 'primary'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground line-clamp-1 text-sm font-medium">
              {contact.full_name}
            </span>
            {archived && (
              <StatusChip tone="muted" size="xs">archived</StatusChip>
            )}
          </div>
          <div className="text-foreground-72 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {contact.role && <span>{contact.role}</span>}
            {contact.company && (
              <>
                {contact.role && <span className="text-subtle-foreground">·</span>}
                <span>{contact.company.name}</span>
              </>
            )}
            {contact.branches.map((b) => {
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
            })}
          </div>
        </div>
        <div className="text-foreground-56 hidden items-center gap-3 text-xs sm:flex">
          {contact.email && <Mail className="h-3 w-3" />}
          {contact.phone && <Phone className="h-3 w-3" />}
        </div>
        <ChevronRight className="text-foreground-56 h-4 w-4 shrink-0" />
      </div>
    </Link>
  );
}
