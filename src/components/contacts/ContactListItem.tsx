import { Link } from 'react-router-dom';
import { ChevronRight, Mail, Phone, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCHES, type BranchCode } from '@/lib/branches';
import type { ContactListItem as Item } from '@/lib/contacts';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

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
        <div className="bg-surface-1 text-primary-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
          {initials(contact.full_name) || <User className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-foreground line-clamp-1 text-sm font-medium">
            {contact.full_name}
            {archived && (
              <span className="text-subtle-foreground ml-2 text-[10px] uppercase tracking-wider">
                archived
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {contact.role && <span className="text-foreground/85">{contact.role}</span>}
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
        <div className="text-subtle-foreground hidden items-center gap-3 text-xs sm:flex">
          {contact.email && <Mail className="h-3 w-3" />}
          {contact.phone && <Phone className="h-3 w-3" />}
        </div>
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
      </div>
    </Link>
  );
}
