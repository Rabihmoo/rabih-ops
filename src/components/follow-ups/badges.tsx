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
  pending: 'bg-slate-700/40 text-slate-100',
  done: 'bg-emerald-700/40 text-emerald-100',
  snoozed: 'bg-violet-700/40 text-violet-100',
  cancelled: 'bg-zinc-700/40 text-zinc-300 line-through',
};

export function FollowUpStatusBadge({
  status,
  className,
}: {
  status: FollowUpStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        STATUS_CLASSES[status],
        className,
      )}
    >
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
        'text-muted-foreground inline-flex items-center gap-1 text-xs',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {CATEGORY_LABEL[category]}
    </span>
  );
}
