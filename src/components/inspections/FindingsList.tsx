import { useState } from 'react';
import { Loader2, Pencil, Plus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { useCanAdminInspect, useCanMutate } from '@/hooks/usePermissions';
import {
  useAddFinding,
  useUpdateFinding,
  useResolveFinding,
} from '@/hooks/useInspections';
import type {
  FindingSeverity,
  FindingStatus,
  InspectionFindingRow,
} from '@/types/database';
import { SeverityBadge, FindingStatusBadge } from './badges';
import { FindingForm } from './FindingForm';

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function FindingsList({
  inspectionId,
  findings,
}: {
  inspectionId: string;
  findings: InspectionFindingRow[];
}) {
  const canAdmin = useCanAdminInspect();
  const canMutate = useCanMutate();

  const add = useAddFinding();
  const update = useUpdateFinding();
  const resolve = useResolveFinding();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const handleResolve = async () => {
    if (!resolvingId) return;
    try {
      await resolve.mutateAsync({
        id: resolvingId,
        resolutionNote: resolutionNote || undefined,
        inspectionId,
      });
      setResolvingId(null);
      setResolutionNote('');
      toast({ title: 'Finding resolved' });
    } catch (err) {
      toast({
        title: 'Could not resolve finding',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const sorted = [...findings].sort((a, b) => {
    const order = { critical: 0, major: 1, minor: 2 } as const;
    const sa = order[a.severity as FindingSeverity] ?? 3;
    const sb = order[b.severity as FindingSeverity] ?? 3;
    if (sa !== sb) return sa - sb;
    return a.created_at.localeCompare(b.created_at);
  });

  return (
    <div className="space-y-3">
      {findings.length === 0 ? (
        <div className="text-muted-foreground text-sm">No findings recorded.</div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((f) => {
            const status = f.status as FindingStatus;
            const isResolved = status === 'resolved';
            const isEditing = editingId === f.id;
            const isResolving = resolvingId === f.id;

            if (isEditing && canAdmin) {
              return (
                <li key={f.id}>
                  <Card>
                    <CardContent className="p-4">
                      <FindingForm
                        initial={f}
                        inspectionId={inspectionId}
                        submitting={update.isPending}
                        onUpdate={(id, updates) =>
                          update.mutateAsync({ id, updates, inspectionId })
                        }
                        onCancel={() => setEditingId(null)}
                      />
                    </CardContent>
                  </Card>
                </li>
              );
            }

            return (
              <li
                key={f.id}
                className="bg-surface-1 border-border space-y-2 rounded-md border px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={f.severity as FindingSeverity} />
                      <FindingStatusBadge status={status} />
                      {f.responsible && (
                        <span className="text-subtle-foreground text-xs">
                          → {f.responsible}
                        </span>
                      )}
                      {f.follow_up_date && (
                        <span className="text-subtle-foreground text-xs">
                          due {relativeDate(f.follow_up_date)}
                        </span>
                      )}
                    </div>
                    <div className="text-foreground/95 text-sm leading-relaxed whitespace-pre-wrap">
                      {f.description}
                    </div>
                    {f.action_required && (
                      <div className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap">
                        <span className="text-section-label mr-2">Action</span>
                        {f.action_required}
                      </div>
                    )}
                    {isResolved && f.resolution_note && (
                      <div className="bg-success-soft text-success-ink mt-2 rounded-xs px-2.5 py-1.5 text-xs leading-relaxed">
                        <span className="font-semibold uppercase tracking-wider">
                          Resolved
                        </span>{' '}
                        {f.resolved_at && `on ${relativeDate(f.resolved_at)} — `}
                        {f.resolution_note}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!isResolved && canMutate && !isResolving && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setResolvingId(f.id)}
                        data-testid="resolve-finding-button"
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Resolve
                      </Button>
                    )}
                    {canAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(f.id)}
                        aria-label="Edit finding"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {isResolving && (
                  <div className="border-border mt-2 space-y-2 border-t pt-3">
                    <label
                      className="text-foreground/90 text-xs font-medium"
                      htmlFor={`resolution-${f.id}`}
                    >
                      Resolution note (optional)
                    </label>
                    <Input
                      id={`resolution-${f.id}`}
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      placeholder="What was done?"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleResolve}
                        disabled={resolve.isPending}
                      >
                        {resolve.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Confirm resolved
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setResolvingId(null);
                          setResolutionNote('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && canAdmin && (
        <Card>
          <CardContent className="p-4">
            <FindingForm
              inspectionId={inspectionId}
              submitting={add.isPending}
              onAdd={(input) => add.mutateAsync(input)}
              onCancel={() => setAdding(false)}
            />
          </CardContent>
        </Card>
      )}

      {!adding && canAdmin && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
          data-testid="add-finding-button"
        >
          <Plus className="mr-1 h-4 w-4" /> Add finding
        </Button>
      )}
    </div>
  );
}
