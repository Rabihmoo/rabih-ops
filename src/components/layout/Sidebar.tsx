import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ListChecks, PhoneCall, ClipboardCheck, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCH_LIST } from '@/lib/branches';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/follow-ups', label: 'Follow-ups', icon: PhoneCall },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="bg-card text-card-foreground md:border-border hidden border-r md:flex md:w-64 md:flex-col">
      <div className="px-5 py-5">
        <div className="text-lg font-semibold tracking-tight">Rabih Ops</div>
        <div className="text-muted-foreground text-xs">Operations management</div>
      </div>

      <nav className="flex-1 px-2">
        <ul className="space-y-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-6 px-2">
          <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
            Branches
          </div>
          <ul className="space-y-1">
            {BRANCH_LIST.map((b) => (
              <li key={b.code} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                <span>{b.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="text-muted-foreground border-border border-t px-5 py-3 text-xs">
        v0.1 · staging
      </div>
    </aside>
  );
}

export function MobileNav() {
  return (
    <nav className="bg-card border-border fixed inset-x-0 bottom-0 z-40 flex border-t md:hidden">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px]',
              isActive ? 'text-foreground' : 'text-muted-foreground',
            )
          }
        >
          <Icon className="h-5 w-5" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
