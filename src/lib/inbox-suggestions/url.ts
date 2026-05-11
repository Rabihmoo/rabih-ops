// Pure URL builders for suggestion actions. Decoupled from React.
// Used by SuggestionStrip to render Link vs anchor with the right href.

import type { ActivityItem, ActivitySource } from '../activity-inbox';
import type { Suggestion } from './types';

export interface SuggestionUrl {
  url: string;
  external: boolean;
}

function qs(params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    const trimmed = String(v).trim();
    if (trimmed === '') continue;
    sp.set(k, trimmed);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function inAppPathForTarget(source: ActivitySource, nativeId: string): string {
  switch (source) {
    case 'task':
      return `/tasks/${nativeId}`;
    case 'follow_up':
      return `/follow-ups/${nativeId}`;
    case 'purchase':
      return `/purchases/${nativeId}`;
    case 'document':
      return `/documents/${nativeId}`;
    case 'inspection_finding':
      // Findings don't have their own detail page; the inbox row's
      // entity_url points at the parent inspection. Suggestion targets
      // never use inspection_finding source, so this is a defensive
      // fallback only.
      return '/inspections';
    case 'gmail':
      return `https://mail.google.com/mail/u/0/#inbox/${nativeId}`;
    case 'calendar':
      return 'https://calendar.google.com/';
    case 'telegram':
      return '/';
  }
}

/**
 * Returns the navigation destination for a suggestion. The caller picks
 * Link vs <a target="_blank"> based on `external`.
 */
export function buildSuggestionUrl(
  s: Suggestion,
  parentItem: ActivityItem,
): SuggestionUrl {
  switch (s.action) {
    case 'create_task': {
      const p = s.prefill ?? {};
      return {
        url: `/tasks/new${qs({
          title: p.title,
          branch: p.branch ?? undefined,
          description: p.description,
          priority: p.priority,
          due_date: p.due_date,
        })}`,
        external: false,
      };
    }
    case 'create_follow_up': {
      const p = s.prefill ?? {};
      return {
        url: `/follow-ups/new${qs({
          title: p.title,
          due_date: p.due_date,
          person: p.person,
          branch: p.branch ?? undefined,
          description: p.description,
        })}`,
        external: false,
      };
    }
    case 'create_purchase_request': {
      const p = s.prefill ?? {};
      return {
        url: `/purchases/new${qs({
          title: p.title,
          supplier_name: p.supplier_name,
          branch: p.branch ?? undefined,
          description: p.description,
        })}`,
        external: false,
      };
    }
    case 'link_to_existing':
    case 'open_related': {
      if (!s.target) return { url: parentItem.entity_url, external: false };
      const path = inAppPathForTarget(s.target.source, s.target.native_id);
      return { url: path, external: path.startsWith('http') };
    }
    case 'link_document': {
      const sep = parentItem.entity_url.includes('?') ? '&' : '?';
      return {
        url: `${parentItem.entity_url}${sep}openLinkDocs=1`,
        external: false,
      };
    }
  }
}
