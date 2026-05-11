// Ghost row that matches the ActivityRow layout (4px left bar + icon strip
// + title + summary + right-side timestamp). Rendered while the very
// first inbox fetch is in flight; background revalidations keep the
// previous list visible instead of flashing skeletons.

export function ActivityRowSkeleton() {
  return (
    <div
      className="border-border flex items-stretch rounded-md border"
      data-testid="inbox-skeleton"
      aria-hidden="true"
    >
      <span className="bg-border w-1 shrink-0 self-stretch rounded-l-md" />
      <div className="flex flex-1 items-center gap-3 px-3 py-2.5 min-w-0">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="bg-border h-3.5 w-3.5 animate-pulse rounded-sm" />
          <span className="bg-border hidden h-2 w-12 animate-pulse rounded sm:inline-block" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <span className="bg-border block h-3 w-3/5 animate-pulse rounded" />
          <span className="bg-border block h-2 w-2/5 animate-pulse rounded" />
        </div>
        <span className="bg-border h-3 w-12 shrink-0 animate-pulse rounded" />
      </div>
    </div>
  );
}

export function ActivityListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="space-y-1.5" data-testid="inbox-list-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <ActivityRowSkeleton />
        </li>
      ))}
    </ul>
  );
}
