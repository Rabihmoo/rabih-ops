import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { ContactForm } from '@/components/contacts/ContactForm';
import { BranchMultiSelect } from '@/components/shared/BranchMultiSelect';
import { ContactIntelligenceCard } from '@/components/contacts/ContactIntelligenceCard';
import { LinkedRecordsPanel } from '@/components/shared/LinkedRecordsPanel';
import {
  useArchiveContact,
  useContact,
  useSetContactBranches,
  useUnarchiveContact,
  useUpdateContact,
} from '@/hooks/useContacts';
import { useCanMutate } from '@/hooks/usePermissions';
import { BRANCHES, type BranchCode } from '@/lib/branches';

export function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const contact = useContact(id ?? null);
  const update = useUpdateContact();
  const archive = useArchiveContact();
  const unarchive = useUnarchiveContact();
  const setBranches = useSetContactBranches();
  const canMutate = useCanMutate();

  const [editing, setEditing] = useState(false);
  const [editingBranches, setEditingBranches] = useState(false);
  const [draftBranches, setDraftBranches] = useState<string[]>([]);

  if (!id) return null;
  if (contact.isLoading) {
    return <div className="text-muted-foreground p-6 text-sm">Loading…</div>;
  }
  if (contact.error || !contact.data) {
    return (
      <div className="text-destructive-ink p-6 text-sm">
        Could not load this contact.
      </div>
    );
  }
  const ct = contact.data;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/contacts"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to contacts
      </Link>

      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-foreground text-3xl font-semibold tracking-tight">
              {ct.full_name}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {ct.role && <span>{ct.role}</span>}
              {ct.company && (
                <>
                  {ct.role && <span> · </span>}
                  <Link to={`/companies/${ct.company.id}`} className="hover:underline">
                    {ct.company.name}
                  </Link>
                </>
              )}
              {!ct.active && (
                <span className="text-subtle-foreground ml-2 text-[10px] uppercase tracking-wider">
                  archived
                </span>
              )}
            </p>
          </div>
          {canMutate && !editing && (
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="contact-edit">
                Edit
              </Button>
              {ct.active ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await archive.mutateAsync(ct.id);
                      toast({ title: 'Contact archived' });
                    } catch (e) {
                      toast({
                        title: 'Could not archive',
                        description: e instanceof Error ? e.message : 'Unknown',
                        variant: 'destructive',
                      });
                    }
                  }}
                  disabled={archive.isPending}
                  data-testid="contact-archive"
                >
                  <Archive className="mr-1 h-4 w-4" /> Archive
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await unarchive.mutateAsync(ct.id);
                      toast({ title: 'Contact unarchived' });
                    } catch (e) {
                      toast({
                        title: 'Could not unarchive',
                        description: e instanceof Error ? e.message : 'Unknown',
                        variant: 'destructive',
                      });
                    }
                  }}
                  disabled={unarchive.isPending}
                  data-testid="contact-unarchive"
                >
                  <ArchiveRestore className="mr-1 h-4 w-4" /> Unarchive
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      <Card>
        <CardContent className="p-5">
          {editing ? (
            <ContactForm
              initial={ct}
              initialBranches={ct.branches}
              submitting={update.isPending}
              submitLabel="Save changes"
              onSubmit={async ({ update: patches, branches: nextBranches }) => {
                if (!patches) return;
                await update.mutateAsync({ id: ct.id, patches });
                const before = [...ct.branches].sort().join(',');
                const after = [...nextBranches].sort().join(',');
                if (before !== after) {
                  await setBranches.mutateAsync({ id: ct.id, branches: nextBranches });
                }
                toast({ title: 'Contact updated' });
                setEditing(false);
              }}
            />
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="Email"           value={ct.email ?? '—'} />
              <Row label="Phone"           value={ct.phone ?? '—'} />
              <Row label="WhatsApp"        value={ct.whatsapp ?? '—'} />
              <Row label="Telegram handle" value={ct.telegram_handle ?? '—'} />
              {ct.notes && (
                <div className="space-y-1 pt-2">
                  <div className="text-section-label">Notes</div>
                  <div className="text-foreground whitespace-pre-wrap text-sm">{ct.notes}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div className="text-section-label">Branches</div>
            {canMutate && !editing && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraftBranches(ct.branches);
                  setEditingBranches((v) => !v);
                }}
                data-testid="contact-branches-toggle"
              >
                {editingBranches ? 'Cancel' : 'Manage branches'}
              </Button>
            )}
          </div>
          {!editingBranches && (
            <div className="flex flex-wrap gap-1.5">
              {ct.branches.length === 0 ? (
                <span className="text-subtle-foreground text-xs">
                  No branches — visible to admin/CEO only.
                </span>
              ) : (
                ct.branches.map((b) => {
                  const meta = (BRANCHES as Record<string, { name: string; color: string } | undefined>)[
                    b as BranchCode
                  ];
                  return (
                    <span
                      key={b}
                      className="border-border bg-card inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                    >
                      {meta && (
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                      )}
                      {meta?.name ?? b}
                    </span>
                  );
                })
              )}
            </div>
          )}
          {editingBranches && (
            <div className="space-y-3">
              <BranchMultiSelect
                value={draftBranches}
                onChange={setDraftBranches}
                testId="contact-branches-editor"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await setBranches.mutateAsync({ id: ct.id, branches: draftBranches });
                      toast({ title: 'Branches updated' });
                      setEditingBranches(false);
                    } catch (e) {
                      toast({
                        title: 'Could not update branches',
                        description: e instanceof Error ? e.message : 'Unknown',
                        variant: 'destructive',
                      });
                    }
                  }}
                  disabled={setBranches.isPending}
                  data-testid="contact-branches-save"
                >
                  Save branches
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingBranches(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ContactIntelligenceCard contactId={id} />

      <LinkedRecordsPanel entityType="contact" entityId={id} />

      <button
        type="button"
        className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
        onClick={() => navigate('/contacts')}
      >
        Back to contacts
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
