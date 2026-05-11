import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCHES, BRANCH_LIST } from '@/lib/branches';
import { useAuthStore } from '@/stores/authStore';

// Simple branch picker — checkbox list (each row = a branch the caller
// can access) with a chip preview of the current selection. Designed for
// inline use inside forms; no library / no modal / no fuzzy search.
//
// Access rules mirror the DB: admin/ceo see every branch; everyone else
// sees only the branches in their assigned branches array (or 'all').
//
// Selected branches OUTSIDE the caller's access are preserved (rendered
// as locked chips with a disabled checkbox) so a non-admin editor can't
// accidentally strip access from another branch.

export function BranchMultiSelect({
  value,
  onChange,
  disabled,
  testId,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'ceo';

  const accessibleCodes = useMemo(() => {
    if (isAdmin) return new Set(BRANCH_LIST.map((b) => b.code));
    if (!profile) return new Set<string>();
    if (profile.branches.includes('all')) return new Set(BRANCH_LIST.map((b) => b.code));
    return new Set(profile.branches);
  }, [profile, isAdmin]);

  const inaccessibleSelected = useMemo(
    () => value.filter((b) => !accessibleCodes.has(b)),
    [value, accessibleCodes],
  );

  const toggle = (code: string) => {
    if (disabled) return;
    if (!accessibleCodes.has(code)) return; // never let UI toggle inaccessible
    if (value.includes(code)) {
      onChange(value.filter((b) => b !== code));
    } else {
      onChange([...value, code].sort());
    }
  };

  const selectedSet = new Set(value);

  return (
    <div className="space-y-2" data-testid={testId ?? 'branch-multi-select'}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => {
            const meta = (BRANCHES as Record<string, { name: string; color: string } | undefined>)[code];
            const locked = !accessibleCodes.has(code);
            return (
              <span
                key={code}
                className={cn(
                  'border-border bg-card inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
                  locked && 'opacity-60',
                )}
              >
                {meta && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                )}
                <span>{meta?.name ?? code}</span>
                {locked && <span className="text-subtle-foreground">·  read-only</span>}
              </span>
            );
          })}
        </div>
      )}

      <div className="border-border divide-border bg-card divide-y overflow-hidden rounded-md border">
        {BRANCH_LIST.map((b) => {
          const isAccessible = accessibleCodes.has(b.code);
          const selected = selectedSet.has(b.code);
          return (
            <button
              key={b.code}
              type="button"
              disabled={disabled || !isAccessible}
              onClick={() => toggle(b.code)}
              data-testid={`branch-option-${b.code}`}
              data-selected={selected ? 'true' : 'false'}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                isAccessible && !disabled && 'hover:bg-surface-1',
                (!isAccessible || disabled) && 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                className={cn(
                  'border-border flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  selected && 'border-primary bg-primary text-primary-foreground',
                )}
              >
                {selected && <Check className="h-3 w-3" />}
              </span>
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: b.color }}
              />
              <span className="flex-1">{b.name}</span>
              {!isAccessible && (
                <span className="text-subtle-foreground text-[10px] uppercase tracking-wider">
                  no access
                </span>
              )}
            </button>
          );
        })}
      </div>

      {inaccessibleSelected.length > 0 && (
        <p className="text-subtle-foreground text-xs">
          {inaccessibleSelected.length} branch
          {inaccessibleSelected.length === 1 ? '' : 'es'} outside your access
          {' '}are preserved automatically — only admin/CEO can change them.
        </p>
      )}
    </div>
  );
}
