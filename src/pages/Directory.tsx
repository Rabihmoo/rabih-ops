import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';

export function DirectoryPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Directory"
      />
      <p className="text-muted-foreground -mt-2 text-sm">
        Companies and people you work with across branches. Suppliers,
        contractors, landlords, agencies — and the contacts inside them.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to="/companies"
          data-testid="directory-card-companies"
          className="group"
        >
          <Card className="hover:bg-surface-1 h-full transition-colors">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="bg-primary-soft text-primary inline-flex h-10 w-10 items-center justify-center rounded-md">
                  <Building2 className="h-5 w-5" />
                </span>
                <ArrowRight className="text-muted-foreground h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div>
                <div className="text-foreground text-lg font-semibold tracking-tight">
                  Companies
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  Suppliers, contractors, landlords, government, agencies,
                  partners and customers.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/contacts" data-testid="directory-card-contacts" className="group">
          <Card className="hover:bg-surface-1 h-full transition-colors">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="bg-primary-soft text-primary inline-flex h-10 w-10 items-center justify-center rounded-md">
                  <Users className="h-5 w-5" />
                </span>
                <ArrowRight className="text-muted-foreground h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div>
                <div className="text-foreground text-lg font-semibold tracking-tight">
                  Contacts
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  People you work with — internally or at the companies above.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
