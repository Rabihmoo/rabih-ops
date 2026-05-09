import {
  Phone,
  MessageSquare,
  Mail,
  Users,
  HandshakeIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FollowUpCategory, FollowUpStatus } from '@/types/database';

const STATUS_LABEL: Record<FollowUpStatus, string> = {
  pending: 'Pending',
  done: 'Done',
  snoozed: 'Snoozed',
  cancelled: 'Cancelled',
};

const STATUS_CLASSES: Record<FollowUpStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  done: 'bg-success-soft text-success-ink',
  snoozed: 'bg-warning-soft text-warning-ink',
  cancelled: 'bg-muted text-subtle-foreground line-through',
};

const PILL_BASE =
  'inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider';

export function FollowUpStatusBadge({
  status,
  className,
}: {
  status: FollowUpStatus;
  className?: string;
}) {
  return (
    <span className={cn(PILL_BASE, STATUS_CLASSES[status], className)}>
      {STATUS_LABEL[status]}
    </span>
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
        'text-foreground/85 inline-flex items-center gap-1.5 text-xs font-medium',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {CATEGORY_LABEL[category]}
    </span>
  );
}
