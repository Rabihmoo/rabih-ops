import {
  ClipboardCheck,
  FileText,
  Lock,
  Receipt,
  ShieldAlert,
  StickyNote,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DOCUMENT_TEMPLATES,
  type DocumentTemplate,
} from '@/lib/document-templates';

const ICON_FOR: Record<string, LucideIcon> = {
  sop: FileText,
  policy: ShieldAlert,
  'cleaning-checklist': ClipboardCheck,
  'supplier-profile': Users,
  'incident-report': ShieldAlert,
  'meeting-notes': Receipt,
  'personal-note': Lock,
};

export function TemplatePicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (template: DocumentTemplate | null) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-section-label">Start from template</div>
        {selectedId && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Start blank instead
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <BlankCard
          selected={selectedId === null}
          onClick={() => onSelect(null)}
        />
        {DOCUMENT_TEMPLATES.map((t) => {
          const Icon = ICON_FOR[t.id] ?? StickyNote;
          const selected = selectedId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              data-testid={`template-${t.id}`}
              className={cn(
                'border-border bg-card hover:bg-surface-1 flex flex-col items-start gap-1.5 rounded-md border p-3 text-left transition-colors',
                selected && 'border-primary bg-primary-soft text-primary-ink',
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4', selected ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-foreground text-sm font-medium">{t.label}</span>
              </div>
              <p className="text-muted-foreground line-clamp-2 text-xs">{t.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BlankCard({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="template-blank"
      className={cn(
        'border-border bg-card hover:bg-surface-1 flex flex-col items-start gap-1.5 rounded-md border border-dashed p-3 text-left transition-colors',
        selected && 'border-primary bg-primary-soft text-primary-ink',
      )}
    >
      <div className="flex items-center gap-2">
        <StickyNote className={cn('h-4 w-4', selected ? 'text-primary' : 'text-muted-foreground')} />
        <span className="text-foreground text-sm font-medium">Blank</span>
      </div>
      <p className="text-muted-foreground line-clamp-2 text-xs">
        Start from an empty document. Fill in everything yourself.
      </p>
    </button>
  );
}
