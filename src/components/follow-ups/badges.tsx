import {
  Phone,
  MessageSquare,
  Mail,
  Users,
  HandshakeIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import type { FollowUpCategory, FollowUpStatus } from '@/types/database';

const STATUS_LABEL: Record<FollowUpStatus, string> = {
  pending: 'Pending',
  done: 'Done',
  snoozed: 'Snoozed',
  cancelled: 'Cancelled',
};

// Map FollowUpStatus to a StatusChip tone. Cancelled stays muted (no
// strikethrough — StatusChip doesn't carry one) because the closed
// state already line-throughs the title at the row + detail level.
const STATUS_TONE: Record<FollowUpStatus, StatusTone> = {
  pending:   'muted',
  done:      'success',
  snoozed:   'warning',
  cancelled: 'muted',
};

export function FollowUpStatusBadge({
  status,
  className,
}: {
  status: FollowUpStatus;
  className?: string;
}) {
  return (
    <StatusChip tone={STATUS_TONE[status]} size="xs" className={className}>
      {STATUS_LABEL[status]}
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
