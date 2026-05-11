import { useState } from 'react';
import { ExternalLink, Loader2, Mail, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import {
  useEmailLinksForEntity,
  useGmailActionLink,
  useGmailImportant,
  useGmailLinkStatus,
  useUnlinkEmail,
} from '@/hooks/useGmail';
import { useCanMutate } from '@/hooks/usePermissions';
import type { EmailLinkSnapshot } from '@/lib/gmail';

function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function LinkedEmailsCard({
  entityType,
  entityId,
}: {
  entityType: 'task' | 'follow_up';
  entityId: string;
}) {
  const status = useGmailLinkStatus();
  const links = useEmailLinksForEntity(entityType, entityId);
  const action = useGmailActionLink();
  const unlink = useUnlinkEmail(entityType, entityId);
  const canMutate = useCanMutate();

  const [picking, setPicking] = useState(false);
  const important = useGmailImportant(
    picking && status.data?.connected === true,
  );

  const existing = links.data ?? [];
  const existingIds = new Set(existing.map((l) => l.gmail_message_id));
  const gmailConnected = status.data?.connected === true;

  const handleAttach = async (messageId: string) => {
    try {
      await action.mutateAsync({
        action: 'link',
        entity_type: entityType,
        entity_id: entityId,
        message_id: messageId,
      });
      toast({ title: 'Email linked' });
      setPicking(false);
    } catch (err) {
      toast({
        title: 'Could not link email',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleUnlink = async (linkId: number) => {
    try {
      await unlink.mutateAsync(linkId);
      toast({ title: 'Email unlinked' });
    } catch (err) {
      toast({
        title: 'Could not unlink',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Hide the entire card if no links exist AND Gmail isn't connected —
  // it would just be empty noise on every task/follow-up for someone
  // who hasn't opted into Gmail.
  if (existing.length === 0 && !gmailConnected) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-section-label flex items-center gap-2">
            <Mail className="h-3.5 w-3.5" /> Linked emails
            {existing.length > 0 && (
              <span className="text-foreground/85 normal-case tracking-normal">
                ({existing.length})
              </span>
            )}
          </div>
          {canMutate && gmailConnected && !picking && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPicking(true)}
              data-testid="link-email-button"
            >
              <Plus className="mr-1 h-4 w-4" /> Link email
            </Button>
          )}
        </div>

        {existing.length === 0 && !picking && gmailConnected && (
          <div className="text-muted-foreground py-1 text-xs">
            No emails linked. Use "Link email" to attach an important message.
          </div>
        )}

        {existing.length > 0 && (
          <ul className="space-y-1.5">
            {existing.map((l: EmailLinkSnapshot) => (
              <li
                key={l.id}
                className="hover:bg-surface-1 -mx-2 flex items-start gap-3 rounded-md px-2 py-2 text-sm transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-foreground line-clamp-1 font-medium">
                    {l.subject ?? '(no subject)'}
                  </div>
                  <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                    <span className="text-foreground/85">
                      {l.from_name ?? l.from_address ?? 'Unknown sender'}
                    </span>
                    {l.internal_date && (
                      <>
                        <span className="text-subtle-foreground"> · </span>
                        <span>{whenLabel(l.internal_date)}</span>
                      </>
                    )}
                    {l.snippet && (
                      <>
                        <span className="text-subtle-foreground"> — </span>
                        <span>{l.snippet}</span>
                      </>
                    )}
                  </div>
                </div>
                {l.html_link && (
                  <a
                    href={l.html_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open in Gmail"
                    className="text-muted-foreground hover:text-foreground shrink-0 self-center"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {canMutate && l.mine && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUnlink(l.id)}
                    disabled={unlink.isPending}
                    aria-label="Unlink email"
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
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>Pick an important unread email to attach.</span>
              <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>
                Cancel
              </Button>
            </div>

            {important.isLoading && (
              <div className="text-muted-foreground py-2 text-xs">
                <Loader2 className="mr-2 inline h-3 w-3 animate-spin" /> Loading…
              </div>
            )}
            {important.data?.error && (
              <div className="text-destructive-ink text-xs">
                Gmail error: {important.data.error}
              </div>
            )}
            {important.data && (important.data.messages?.length ?? 0) === 0 && !important.isLoading && (
              <div className="text-muted-foreground py-2 text-xs">
                No important unread emails right now.
              </div>
            )}
            {important.data && important.data.messages.length > 0 && (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {important.data.messages
                  .filter((m) => !existingIds.has(m.id))
                  .map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => handleAttach(m.id)}
                        disabled={action.isPending}
                        className="hover:bg-surface-1 -mx-2 flex w-full items-start gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-foreground line-clamp-1 font-medium">
                            {m.subject ?? '(no subject)'}
                          </div>
                          <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                            <span className="text-foreground/85">
                              {m.from_name ?? m.from_address ?? 'Unknown sender'}
                            </span>
                            {m.snippet && (
                              <>
                                <span className="text-subtle-foreground"> — </span>
                                <span>{m.snippet}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
