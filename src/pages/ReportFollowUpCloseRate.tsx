import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ReportFilterBar, useReportFilters } from '@/components/reports/ReportFilters';
import { reportFollowUpCloseRate } from '@/lib/reports';
import { toCsv, downloadCsv } from '@/lib/csv-export';

export function ReportFollowUpCloseRatePage() {
  const { branch, from, to } = useReportFilters();

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'follow-up-close-rate', branch, from, to],
    queryFn: () => reportFollowUpCloseRate({ branch, from, to }),
  });

  const rows = data ?? [];
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.opened, r.closed)));

  const handleExport = () => {
    const csv = toCsv(
      ['week_start', 'opened', 'closed'],
      rows as unknown as Record<string, unknown>[],
    );
    downloadCsv('follow-up-close-rate.csv', csv);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to="/reports" className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to reports
      </Link>

      <PageHeader
        eyebrow="Report"
        title="Follow-up close rate"
        actions={
          <Button size="sm" variant="outline" onClick={handleExport} disabled={rows.length === 0} data-testid="csv-export">
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <ReportFilterBar />

      {isLoading && <div className="text-muted-foreground p-6 text-sm">Loading report…</div>}

      {!isLoading && rows.length === 0 && (
        <Card><CardContent className="p-0">
          <EmptyState title="No data for this period" tone="muted" size="compact" />
        </CardContent></Card>
      )}

      {!isLoading && rows.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="report-table">
                <thead>
                  <tr className="border-border border-b text-left">
                    <th className="text-foreground-56 pb-2 pr-4 text-xs font-medium">Week</th>
                    <th className="text-foreground-56 pb-2 pr-4 text-xs font-medium">Opened</th>
                    <th className="text-foreground-56 pb-2 pr-4 text-xs font-medium">Closed</th>
                    <th className="text-foreground-56 pb-2 text-xs font-medium">Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.week_start} className="border-border border-b last:border-0">
                      <td className="py-2 pr-4 tabular-nums">{r.week_start}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.opened}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.closed}</td>
                      <td className="py-2">
                        <svg width="120" height="16" className="inline-block">
                          <rect x={0} y={0} height={7} width={Math.max(1, (r.opened / maxVal) * 120)} className="fill-primary/60" rx={2} />
                          <rect x={0} y={9} height={7} width={Math.max(1, (r.closed / maxVal) * 120)} className="fill-success/60" rx={2} />
                        </svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
