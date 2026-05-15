import {
  Phone,
  MessageSquare,
  Mail,
  Users,
  HandshakeIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/ui/status-chip';
import {
  followUpStatusLabel,
  followUpStatusTone,
} from '@/lib/follow-up-status';
import type { FollowUpCategory, FollowUpStatus } from '@/types/database';

// F1.1: label + tone tables moved into src/lib/follow-up-status.ts so
// the helper is testable + reusable. The badge accepts a string so
// any future status that lands in DB before the bundle updates renders
// with a defensive fallback ("Snoozed" → "Snoozed", muted tone) instead
// of crashing the row.
export function FollowUpStatusBadge({
  status,
  className,
}: {
  status: FollowUpStatus | string;
  className?: string;
}) {
  return (
    <StatusChip
      tone={followUpStatusTone(status)}
      size="xs"
      className={className}
    >
      {followUpStatusLabel(status)}
    </StatusChip>
  );
}

const CATEGORY_LABEL: Record<FollowUpCategory, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  email: 'Email',
  meeting: 'Meeting',
  check_in_person: 'In person',
};

const CATEGORY_ICON: Record<FollowUpCategory, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  whatsapp: MessageSquare,
  email: Mail,
  meeting: Users,
  check_in_person: HandshakeIcon,
};

export function FollowUpCategoryBadge({
  category,
  className,
}: {
  category: FollowUpCategory;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category];
  return (
    <span
      className={cn(
        'text-foreground-72 inline-flex items-center gap-1.5 text-xs font-medium',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {CATEGORY_LABEL[category]}
    </span>
  );
}
