import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import {
  useDocuments,
  useDocumentsForEntity,
  useLinkDocument,
  useUnlinkDocument,
} from '@/hooks/useDocuments';
import {
  DOCUMENT_CATEGORY_LABEL,
  DOCUMENT_STATUS_LABEL,
} from '@/lib/documents';
import { useCanMutate } from '@/hooks/usePermissions';
import type { DocumentCategory, DocumentLinkEntityType } from '@/types/database';

const fieldClass =
  'bg-card border-border text-foreground h-9 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function LinkedDocumentsCard({
  entityType,
  entityId,
}: {
  entityType: DocumentLinkEntityType;
  entityId: string;
}) {
  const links = useDocumentsForEntity(entityType, entityId);
  const link = useLinkDocument();
  const unlink = useUnlinkDocument();
  const canMutate = useCanMutate();

  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  // Auto-open the picker when navigated here with ?openLinkDocs=1
  // (e.g., from an inbox suggestion). The flag is consumed once: we
  // open the picker, then strip the param so reloading doesn't loop.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!canMutate) return;
    if (searchParams.get('openLinkDocs') !== '1') return;
    setPicking(true);
    const next = new URLSearchParams(searchParams);
    next.delete('openLinkDocs');
    setSearchParams(next, { replace: true });
  }, [canMutate, searchParams, setSearchParams]);
  const docOptions = useDocuments({
    search: search.trim() || null,
    status: 'active',
    limit: 30,
  });

  const handleAttach = async (docId: string) => {
    try {
      await link.mutateAsync({ docId, entityType, entityId });
      toast({ title: 'Document linked' });
      setPicking(false);
      setSearch('');
    } catch (err) {
      toast({
        title: 'Could not link',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleUnlink = async (linkId: number) => {
    try {
      await unlink.mutateAsync(linkId);
      toast({ title: 'Unlinked' });
    } catch (err) {
      toast({
        title: 'Could not unlink',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const existing = links.data ?? [];
  const existingDocIds = new Set(existing.map((l) => l.document_id));

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-section-label flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" /> Linked documents
            {existing.length > 0 && (
              <span className="text-foreground-72 normal-case tracking-normal">
                ({existing.length})
              </span>
            )}
          </div>
          {canMutate && !picking && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPicking(true)}
              data-testid="link-document-button"
            >
              <Plus className="mr-1 h-4 w-4" /> Link document
            </Button>
          )}
        </div>

        {existing.length === 0 && !picking && (
          <div className="text-muted-foreground py-1 text-xs">
            No documents linked. Use "Link document" to attach an SOP, policy, or note.
          </div>
        )}

        {existing.length > 0 && (
          <ul className="space-y-1.5">
            {existing.map((l) => (
              <li
                key={l.link_id}
                className="hover:bg-surface-1 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors"
              >
                <span className="border-border text-subtle-foreground inline-flex w-20 shrink-0 items-center justify-center rounded-xs border px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                  {DOCUMENT_CATEGORY_LABEL[l.category]}
                </span>
                <Link
                  to={`/documents/${l.document_id}`}
                  className="text-foreground hover:text-primary-ink line-clamp-1 flex-1"
                >
                  {l.title}
                </Link>
                <span className="text-subtle-foreground text-[10px] uppercase tracking-wider">
                  {DOCUMENT_STATUS_LABEL[l.status]}
                </span>
                <Link
                  to={`/documents/${l.document_id}`}
                  aria-label="Open document"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
                {canMutate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUnlink(l.link_id)}
                    disabled={unlink.isPending}
                    aria-label="Unlink document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {picking && (
          <div className="border-border space-y-2 rounded-md border p-3">
            <input
              type="search"
              autoFocus
              placeholder="Search documents by title or body…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={fieldClass}
            />
            {docOptions.isLoading && (
              <div className="text-muted-foreground py-2 text-xs">
                <Loader2 className="mr-2 inline h-3 w-3 animate-spin" /> Searching…
              </div>
            )}
            {docOptions.data && docOptions.data.length === 0 && (
              <div className="text-muted-foreground py-2 text-xs">
                No active documents match. Create one in /documents.
              </div>
            )}
            {docOptions.data && docOptions.data.length > 0 && (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {docOptions.data
                  .filter((d) => !existingDocIds.has(d.id))
                  .map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => handleAttach(d.id)}
                        disabled={link.isPending}
                        className="hover:bg-surface-1 -mx-2 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors"
                      >
                        <span className="border-border text-subtle-foreground inline-flex w-20 shrink-0 items-center justify-center rounded-xs border px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                          {DOCUMENT_CATEGORY_LABEL[d.category as DocumentCategory]}
                        </span>
                        <span className="text-foreground line-clamp-1 flex-1">{d.title}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPicking(false);
                  setSearch('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
