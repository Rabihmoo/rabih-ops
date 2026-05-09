import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ListChecks,
  PhoneCall,
  ClipboardCheck,
  Receipt,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCH_LIST } from '@/lib/branches';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/follow-ups', label: 'Follow-ups', icon: PhoneCall },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/purchases', label: 'Purchasing', icon: Receipt },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Shared active/idle classes used by both desktop sidebar and mobile bottom
// nav. The desktop layout adds the left-edge bar; mobile uses a top bar.
const desktopLink = (isActive: boolean) =>
  cn(
    'group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
    'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:transition-colors',
    isActive
      ? 'bg-primary-soft text-primary-ink font-medium before:bg-primary'
      : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground before:bg-transparent',
  );

export function Sidebar() {
  return (
    <aside className="bg-surface-1 border-border hidden border-r md:flex md:w-60 md:flex-col">
      <div className="border-border flex h-14 items-center border-b px-5">
        <div>
          <div className="text-foreground text-lg font-semibold tracking-tight leading-none">
            RabihOS
          </div>
          <div className="text-subtle-foreground mt-1 text-[11px] tracking-wide">
            Operations console
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => desktopLink(isActive)}>
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-6 px-3">
          <div className="text-section-label mb-2">Branches</div>
          <ul className="space-y-1">
            {BRANCH_LIST.map((b) => (
              <li
                key={b.code}
                className="text-foreground/85 flex items-center gap-2.5 py-1 text-sm"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                <span className="truncate">{b.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-border text-subtle-foreground border-t px-5 py-3 text-[11px] tracking-wide">
        v0.1 · staging
      </div>
    </aside>
  );
}

export function MobileNav() {
  return (
    <nav
      className="bg-surface-1 border-border fixed inset-x-0 bottom-0 z-40 flex h-16 border-t md:hidden"
      aria-label="Primary"
    >
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'relative flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] transition-colors',
              'before:absolute before:top-0 before:h-0.5 before:w-10 before:rounded-full before:transition-colors',
              isActive
                ? 'text-primary-ink before:bg-primary'
                : 'text-muted-foreground hover:text-foreground before:bg-transparent',
            )
          }
        >
          <Icon className="h-5 w-5" />
          <span className="font-medium tracking-wide">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
