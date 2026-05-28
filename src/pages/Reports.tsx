import { Link } from 'react-router-dom';
import {
  BarChart3,
  CircleDollarSign,
  ClipboardCheck,
  PhoneCall,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import type { LucideIcon } from 'lucide-react';

interface ReportCard {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
}

const REPORTS: ReportCard[] = [
  {
    title: 'Task velocity',
    description: 'Created vs finished tasks per week per branch.',
    to: '/reports/task-velocity',
    icon: BarChart3,
  },
  {
    title: 'Supplier spend',
    description: 'Total spend per supplier with currency breakdown.',
    to: '/reports/supplier-spend',
    icon: CircleDollarSign,
  },
  {
    title: 'Inspection pass rate',
    description: 'Pass / issues / fail per week per branch.',
    to: '/reports/inspection-pass-rate',
    icon: ClipboardCheck,
  },
  {
    title: 'Follow-up close rate',
    description: 'Opened vs closed follow-ups per week per branch.',
    to: '/reports/follow-up-close-rate',
    icon: PhoneCall,
  },
];

export function ReportsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader eyebrow="Analytics" title="Reports" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="reports-grid">
        {REPORTS.map((r) => (
          <Link key={r.to} to={r.to} data-testid={`report-link-${r.to.split('/').pop()}`}>
            <Card className="hover:bg-surface-1 transition-colors">
              <CardContent className="flex items-start gap-4 p-5">
                <div className="bg-primary-soft text-primary-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  <r.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-foreground text-sm font-semibold">{r.title}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{r.description}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
