import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ReportFilterBar, useReportFilters } from '@/components/reports/ReportFilters';
import { reportSupplierSpend } from '@/lib/reports';
import { formatSupplierTotal } from '@/lib/reports-display';
import { toCsv, downloadCsv } from '@/lib/csv-export';

export function ReportSupplierSpendPage() {
  const { branch, from, to } = useReportFilters();

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'supplier-spend', branch, from, to],
    queryFn: () => reportSupplierSpend({ branch, from, to }),
  });

  const rows = data ?? [];

  const handleExport = () => {
    const csvRows = rows.map((r) => ({
      supplier_name: r.supplier_name,
      order_count: r.order_count,
      total: formatSupplierTotal(r.total_mzn, r.currency_breakdown),
    }));
    const csv = toCsv(['supplier_name', 'order_count', 'total'], csvRows);
    downloadCsv('supplier-spend.csv', csv);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to="/reports" className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to reports
      </Link>

      <PageHeader
        eyebrow="Report"
        title="Supplier spend"
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
                    <th className="text-foreground-56 pb-2 pr-4 text-xs font-medium">Supplier</th>
                    <th className="text-foreground-56 pb-2 pr-4 text-xs font-medium">Orders</th>
                    <th className="text-foreground-56 pb-2 text-xs font-medium">Total spend</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.supplier_name} className="border-border border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.supplier_name}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.order_count}</td>
                      <td className="py-2 tabular-nums">{formatSupplierTotal(r.total_mzn, r.currency_breakdown)}</td>
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
