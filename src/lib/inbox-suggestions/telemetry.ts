// Stub for suggestion-interaction telemetry.
//
// Phase G2.6 doesn't ship analytics — but we want every callsite where
// a user acts on a suggestion to flow through one function so a future
// phase can route events to audit_log, an external analytics sink, or
// both. Keeping the contract here means we won't have to retrofit every
// callsite later.
//
// G3 candidates for what to do with these events:
//   * Insert an audit_log row via a SECURITY DEFINER RPC (e.g.
//     rpc_audit_event('suggestion_acted_on', …)) so we can measure
//     rule efficacy in SQL.
//   * Forward to a privacy-friendly client analytics sink (e.g. Plausible
//     custom event) if we ever add one.
//
// For now: no-op. The function returns void synchronously so callers
// don't need to await it. Failures are absorbed silently — telemetry
// must never break a navigation flow.

import type { SuggestionAction } from './types';

export interface SuggestionEvent {
  rule: string;
  action: SuggestionAction;
  itemId: string;
  suggestionId: string;
}

export function trackSuggestionAction(_event: SuggestionEvent): void {
  // intentionally empty — see file header for the G3 design space.
}
