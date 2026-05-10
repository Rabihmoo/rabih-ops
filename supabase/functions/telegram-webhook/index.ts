// Telegram webhook — receives updates from Telegram, dispatches commands,
// replies with the rendered text from the matching RPC.
//
// Auth: Telegram includes our `secret_token` as `X-Telegram-Bot-Api-Secret-Token`
// when posting updates. We reject anything else with 403.
//
// All Supabase mutations go through SECURITY DEFINER RPCs called with the
// service-role key. The webhook never touches tables directly.

// deno-lint-ignore-file no-explicit-any
import { makeRpc } from '../_shared/rpc.ts';
import { makeTelegram } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;

const rpc = makeRpc(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const tg = makeTelegram(TELEGRAM_BOT_TOKEN);

const HELP = [
  '🤖 RabihOS bot — what I do',
  '',
  'I keep you on top of operations across BBQ House, SALT,',
  'Central Kitchen, and Executive Cleaning.',
  '',
  '📋 Daily check-in',
  '   /today      Your full open task list (numbered)',
  '   /overdue    Only overdue tasks',
  '   /waiting    Blocked / delayed / needs repeat',
  '   /purchases  Pending deliveries, unpaid, reminders',
  '',
  '⚡ Acting on a task',
  '   First run /today (or /overdue, /waiting). It shows',
  '   tasks numbered 1, 2, 3 …  Then:',
  '',
  '   /done 1               mark task #1 finished',
  '   /done 1 your outcome  finish + record an outcome',
  '   /note 1 your text     add a note to task #1',
  '',
  '⚡ Creating a task',
  '   /task <title> for <branch>',
  '   Example: /task Buy oil for centralkitchen',
  '   Branches: bbqhouse · salt · centralkitchen · cleaning',
  '',
  '⚙ Account',
  '   /unlink     Disconnect this Telegram from RabihOS',
  '   /help       This list',
  '',
  '🔔 Automatic',
  '   • Daily summary every morning at 08:00 (Africa/Maputo)',
  '   • Reminders on tasks where you set start /',
  '     follow-up / deadline times in the app',
].join('\n');

interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { username?: string; first_name?: string };
    text?: string;
  };
  edited_message?: TelegramUpdate['message'];
}

Deno.serve(async (req) => {
  // 1. Secret-token gate
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch (_e) {
    return new Response('bad request', { status: 400 });
  }

  const msg = update.message ?? update.edited_message;
  if (!msg || !msg.text) {
    return new Response('ignored', { status: 200 });
  }

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const username = msg.from?.username ?? null;
  const firstName = msg.from?.first_name ?? null;

  // 2. Log inbound (best-effort)
  await safeLog(chatId, 'inbound', text, parseCommand(text));

  // 3. Route + execute
  let reply = '';
  try {
    reply = await dispatch({ chatId, text, username, firstName });
  } catch (err) {
    reply = `⚠️ ${err instanceof Error ? err.message : 'Something broke. Try /help.'}`;
  }

  // 4. Send reply (don't crash if Telegram is unreachable; log + 200)
  try {
    if (reply) await tg.sendMessage(chatId, reply);
    await safeLog(chatId, 'outbound', reply, null, reply);
  } catch (err) {
    await safeLog(chatId, 'outbound', reply, null, null,
                  err instanceof Error ? err.message : String(err));
  }

  return new Response('ok', { status: 200 });
});

function parseCommand(text: string): string | null {
  const m = text.match(/^\/(\w+)/);
  return m ? '/' + m[1].toLowerCase() : null;
}

async function safeLog(
  chatId: number,
  direction: 'inbound' | 'outbound',
  body: string,
  command: string | null = null,
  response: string | null = null,
  error: string | null = null,
) {
  try {
    await rpc('rpc_telegram_log', {
      p_chat_id: chatId,
      p_user_id: null,
      p_direction: direction,
      p_message_text: body,
      p_parsed_command: command,
      p_parsed_params: null,
      p_response_text: response,
      p_error: error,
    });
  } catch (_e) {
    // never let logging failures break message handling
  }
}

interface DispatchArgs {
  chatId: number;
  text: string;
  username: string | null;
  firstName: string | null;
}

async function dispatch({ chatId, text, username, firstName }: DispatchArgs): Promise<string> {
  // /start <token> — link flow
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const token = parts[1] ?? '';
    if (!token) {
      return [
        '👋 Welcome to RabihOS.',
        '',
        'Open RabihOS → Settings → Link Telegram to receive a one-time link token,',
        'then click the t.me link it shows you.',
      ].join('\n');
    }
    await rpc('rpc_telegram_complete_link', {
      p_token: token,
      p_chat_id: chatId,
      p_username: username,
      p_first_name: firstName,
    });
    return [
      '✅ Linked to RabihOS.',
      '',
      'Try /today, /overdue, /waiting, /purchases, /help.',
    ].join('\n');
  }

  // Parse the head and tail (rest) once. /done, /note, /task all match
  // the same pattern: bare command falls into a usage hint instead of /help.
  const m = text.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  const cmd = m ? m[1].toLowerCase() : '';
  const rest = (m && m[2] ? m[2] : '').trim();

  if (cmd === 'help')      return HELP;
  if (cmd === 'today')     return await rpcText('rpc_telegram_today',     { p_chat_id: chatId });
  if (cmd === 'overdue')   return await rpcText('rpc_telegram_overdue',   { p_chat_id: chatId });
  if (cmd === 'waiting')   return await rpcText('rpc_telegram_waiting',   { p_chat_id: chatId });
  if (cmd === 'purchases') return await rpcText('rpc_telegram_purchases', { p_chat_id: chatId });

  if (cmd === 'unlink') {
    const r = await rpc<{ success: boolean; message?: string }>('rpc_telegram_unlink', {
      p_chat_id: chatId,
    });
    return r.success ? '👋 Unlinked. /start a new link any time.' : (r.message ?? 'Nothing to unlink.');
  }

  if (cmd === 'done') {
    if (!rest) {
      return [
        '⚠️ Missing task number.',
        '',
        'How it works:',
        '   1. Run /today — your tasks are numbered 1, 2, 3 …',
        '   2. Type /done 1 to finish task #1',
        '',
        'You can also record an outcome:',
        '   /done 1 Cooler at 4°C, all green.',
      ].join('\n');
    }
    const [id, ...outcome] = rest.split(/\s+/);
    return await rpcText('rpc_telegram_complete_task', {
      p_chat_id: chatId,
      p_id_or_prefix: id,
      p_outcome: outcome.length > 0 ? outcome.join(' ') : null,
    });
  }

  if (cmd === 'note') {
    const noteMatch = rest.match(/^(\S+)\s+([\s\S]+)$/);
    if (!noteMatch) {
      return [
        '⚠️ Usage: /note <task-number> <text>',
        '',
        'How it works:',
        '   1. Run /today — your tasks are numbered 1, 2, 3 …',
        '   2. Type /note 1 followed by your note',
        '',
        'Example: /note 1 Spoke to vendor, ETA Friday.',
      ].join('\n');
    }
    return await rpcText('rpc_telegram_add_note', {
      p_chat_id: chatId,
      p_id_or_prefix: noteMatch[1],
      p_body: noteMatch[2],
    });
  }

  if (cmd === 'task') {
    if (!rest) {
      return [
        '⚠️ Usage: /task <title> for <branch>',
        '',
        'Example:',
        '   /task Buy oil for centralkitchen',
        '',
        'Branches: bbqhouse, salt, centralkitchen, cleaning.',
      ].join('\n');
    }
    // Trailing "for <code>" or "branch <code>"
    const taskMatch = rest.match(/^(.+?)\s+(?:branch|for)\s+([a-z]+)\s*$/i);
    if (!taskMatch) {
      return [
        '⚠️ Branch missing.',
        '',
        'Add "for <branch>" at the end:',
        '   /task <title> for <branch>',
        '',
        'Example:',
        '   /task Buy oil for centralkitchen',
        '',
        'Branches: bbqhouse, salt, centralkitchen, cleaning.',
      ].join('\n');
    }
    return await rpcText('rpc_telegram_create_task', {
      p_chat_id: chatId,
      p_title: taskMatch[1].trim(),
      p_branch: taskMatch[2].toLowerCase(),
      p_priority: 'normal',
      p_due_date: null,
    });
  }

  // Unknown command — fall through to help. Anything that didn't start with
  // a slash also lands here.
  return HELP;
}

async function rpcText(name: string, args: Record<string, unknown>): Promise<string> {
  // RPCs that return text deserialize as a JSON string; PostgREST gives back
  // the bare string when the function returns text.
  const out = await rpc<unknown>(name, args);
  if (typeof out === 'string') return out;
  return String(out ?? '');
}
