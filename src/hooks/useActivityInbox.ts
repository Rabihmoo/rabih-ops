import { useQuery } from '@tanstack/react-query';
import {
  fetchAllActivityInbox,
  type FetchAllOptions,
  type FetchAllResult,
} from '@/lib/activity-inbox';

export function useActivityInbox(opts: FetchAllOptions = {}) {
  return useQuery<FetchAllResult>({
    // Stable key — opts is a tiny object of primitives so JSON-key works fine
    // and TanStack handles deep equality at the hook layer.
    queryKey: ['activity-inbox', opts],
    queryFn: () => fetchAllActivityInbox(opts),
    // The inbox is "near-realtime" — DB sources change every few minutes, Gmail
    // metadata fewer than that. 60s staleTime keeps the page snappy on
    // re-mount without thrashing Google's APIs.
    staleTime: 60 * 1000,
    // Don't auto-refetch on focus — the user will hit refresh if they want it.
    refetchOnWindowFocus: false,
  });
}
