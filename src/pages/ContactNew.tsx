import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ContactForm, type ContactFormSeed } from '@/components/contacts/ContactForm';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from '@/components/ui/toast';
import { useCreateContact } from '@/hooks/useContacts';
import { useCanMutate } from '@/hooks/usePermissions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readContactSeed(params: URLSearchParams): ContactFormSeed {
  const seed: ContactFormSeed = {};
  const title = params.get('title');
  if (title && title.trim()) seed.full_name = title;
  const fullName = params.get('full_name');
  if (fullName && fullName.trim()) seed.full_name = fullName;
  const companyId = params.get('company_id');
  if (companyId && UUID_RE.test(companyId)) seed.company_id = companyId;
  return seed;
}

export function ContactNewPage() {
  const navigate = useNavigate();
  const create = useCreateContact();
  const canMutate = useCanMutate();
  const [searchParams] = useSearchParams();
  const seed = readContactSeed(searchParams);

  if (!canMutate) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          to="/contacts"
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to contacts
        </Link>
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ShieldAlert}
              tone="warning"
              size="tall"
              title="You can't create contacts."
              description="Your role is read-only for the Directory. Ask an admin or manager to add this contact for you."
              action={
                <Button variant="outline" asChild size="sm">
                  <Link to="/contacts">Back to contacts</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/contacts"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to contacts
      </Link>

      <header className="space-y-1">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          New contact
        </h1>
        <p className="text-muted-foreground text-sm">
          Add a person you work with. Attach a company to inherit its branches
          automatically.
        </p>
      </header>

      <Card>
        <CardContent className="p-5">
          <ContactForm
            seed={seed}
            submitting={create.isPending}
            submitLabel="Create contact"
            onSubmit={async ({ create: payload }) => {
              if (!payload) return;
              const row = await create.mutateAsync(payload);
              toast({ title: 'Contact created' });
              navigate(`/contacts/${row.id}`, { replace: true });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
