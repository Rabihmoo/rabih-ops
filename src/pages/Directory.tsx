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
      <p className="text-foreground-72 -mt-2 text-sm">
        Companies and people you work with across branches. Suppliers,
        contractors, landlords, agencies — and the contacts inside them.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to="/companies"
          data-testid="directory-card-companies"
          className="group"
        >
          <Card className="hover:bg-surface-1 hover:shadow-glow-blue h-full transition-all duration-200">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="bg-gradient-primary text-primary-foreground inline-flex h-10 w-10 items-center justify-center rounded-md shadow-sm">
                  <Building2 className="h-5 w-5" />
                </span>
                <ArrowRight className="text-foreground-56 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <div>
                <div className="text-foreground text-lg font-semibold tracking-tight">
                  Companies
                </div>
                <p className="text-foreground-72 mt-1 text-sm">
                  Suppliers, contractors, landlords, government, agencies,
                  partners and customers.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/contacts" data-testid="directory-card-contacts" className="group">
          <Card className="hover:bg-surface-1 hover:shadow-glow-blue h-full transition-all duration-200">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="bg-gradient-primary text-primary-foreground inline-flex h-10 w-10 items-center justify-center rounded-md shadow-sm">
                  <Users className="h-5 w-5" />
                </span>
                <ArrowRight className="text-foreground-56 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <div>
                <div className="text-foreground text-lg font-semibold tracking-tight">
                  Contacts
                </div>
                <p className="text-foreground-72 mt-1 text-sm">
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
