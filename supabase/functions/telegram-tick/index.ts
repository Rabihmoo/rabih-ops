// telegram-tick — internal cron endpoint, called by pg_cron every minute via
// pg_net. Drains pending Telegram reminders and, at 08:00 Africa/Maputo,
// fans out the daily summary to admin/CEO linked users.
//
// Auth: shared bearer secret in `Authorization: Bearer <TELEGRAM_INTERNAL_SECRET>`.
// Anything else is rejected with 403.

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import { makeTelegram } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_INTERNAL_SECRET = Deno.env.get('TELEGRAM_INTERNAL_SECRET')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const tg = makeTelegram(TELEGRAM_BOT_TOKEN);

interface ClaimedReminder {
  id: number;
  kind: string;
  entity_type: string;
  entity_id: string;
  recipient_id: string;
  fire_at: string;
  attempts: number;
  payload: Record<string, unknown> | null;
  tg_chat_id: number | null;
  task_title: string | null;
  task_branch: string | null;
}

Deno.serve(async (req) => {
  // 1. Internal-secret gate
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${TELEGRAM_INTERNAL_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  const result = { drained: 0, summaries_sent: 0, errors: [] as string[] };

  // 2. Drain Telegram reminders (≤20 per tick)
  try {
    const claimed = await rpc<ClaimedReminder[]>('rpc_claim_telegram_reminders', { p_limit: 20 });
    for (const r of claimed) {
      if (!r.tg_chat_id) {
        // Recipient is no longer linked. Mark failed so we don't keep retrying.
        await rpc('rpc_mark_telegram_reminder_failed', {
          p_queue_id: r.id,
          p_error: 'recipient has no active telegram chat',
        });
        continue;
      }
      try {
        const text = formatReminder(r);
        const sent = await tg.sendMessage(r.tg_chat_id, text);
        await rpc('rpc_mark_telegram_reminder_sent', {
          p_queue_id: r.id,
          p_provider_msg_id: String(sent.message_id),
        });
        result.drained += 1;
      } catch (err) {
        await rpc('rpc_mark_telegram_reminder_failed', {
          p_queue_id: r.id,
          p_error: err instanceof Error ? err.message : String(err),
        });
        result.errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  } catch (err) {
    result.errors.push(`drain: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Daily summary at 08:00 Africa/Maputo (Mozambique has no DST → UTC+2)
  try {
    if (isMaputoMorningTick(new Date())) {
      const chats = await rpc<{ user_id: string; tg_chat_id: number; role: string }[]>(
        'rpc_list_active_telegram_chats',
        {},
      );
      for (const c of chats) {
        try {
          const text = await rpc<string>('rpc_telegram_daily_summary', { p_chat_id: c.tg_chat_id });
          await tg.sendMessage(c.tg_chat_id, text);
          result.summaries_sent += 1;
        } catch (err) {
          result.errors.push(
            `summary ${c.tg_chat_id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  } catch (err) {
    result.errors.push(`summary-fanout: ${err instanceof Error ? err.message : String(err)}`);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// True iff the current UTC instant is 06:00 Africa/Maputo == 08:00 (no DST).
// We check both hour and minute to fire only on the first tick of the hour.
function isMaputoMorningTick(now: Date): boolean {
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  return utcHour === 6 && utcMin === 0;
}

function formatReminder(r: ClaimedReminder): string {
  const title = r.task_title ?? 'Task';
  const branch = r.task_branch ? ` · ${r.task_branch}` : '';
  switch (r.kind) {
    case 'start_reminder':
      return `⏰ Start by now: ${title}${branch}`;
    case 'follow_up_reminder':
      return `🔔 Mid-task check: ${title}${branch}`;
    case 'deadline_reminder':
      return `⏳ Pre-deadline: ${title}${branch}`;
    default:
      return `🔔 Reminder: ${title}${branch}`;
  }
}
