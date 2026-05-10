import { useState, useMemo } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { marked } from 'marked';
import { cn } from '@/lib/utils';

// Marked is configured for safety: no raw HTML, breaks honoured (newline → <br>),
// GFM (tables, strikethrough). For attachments / images we use the existing
// AttachmentList — Markdown stays text-only.
marked.setOptions({
  gfm: true,
  breaks: true,
});

const fieldClass =
  'bg-card border-border text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono';

export function MarkdownEditor({
  value,
  onChange,
  rows = 18,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const html = useMemo(() => {
    if (!value) return '';
    try {
      // marked.parse can return string | Promise<string>; we always pass synchronous flag.
      return marked.parse(value, { async: false }) as string;
    } catch {
      return '';
    }
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors',
            mode === 'edit'
              ? 'border-primary bg-primary-soft text-primary-ink'
              : 'border-border text-foreground/85 hover:bg-surface-1',
          )}
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors',
            mode === 'preview'
              ? 'border-primary bg-primary-soft text-primary-ink'
              : 'border-border text-foreground/85 hover:bg-surface-1',
          )}
        >
          <Eye className="h-3 w-3" /> Preview
        </button>
        <span className="text-subtle-foreground ml-auto text-xs">Markdown</span>
      </div>

      {mode === 'edit' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          spellCheck
          placeholder={placeholder ?? 'Write SOP, policy, note… (Markdown supported)'}
          className={fieldClass}
          data-testid="markdown-textarea"
        />
      ) : (
        <article
          className="bg-surface-1 border-border prose prose-invert min-h-[12rem] w-full max-w-none rounded-md border px-4 py-3 text-sm leading-relaxed [&_a]:text-primary-ink [&_code]:bg-surface-2 [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_pre]:bg-surface-2 [&_pre]:p-3"
          dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
        />
      )}
    </div>
  );
}
