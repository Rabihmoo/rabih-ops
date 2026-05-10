// Final solo-use readiness check.
// All probes; no writes. Idempotent.

const t = process.env.SUPABASE_ACCESS_TOKEN;
const r = process.env.SUPABASE_PROJECT_REF;
if (!t || !r) { console.error('env'); process.exit(1); }

let pass = 0, fail = 0;
const issues = [];
function check(label, ok, detail = '') {
  if (ok) { console.log(`  ✓ ${label}${detail ? '  — ' + detail : ''}`); pass++; }
  else    { console.log(`  ✗ ${label}${detail ? '  — ' + detail : ''}`); fail++; issues.push(label + (detail ? ': ' + detail : '')); }
}
async function sql(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${r}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(await res.text());
  return JSON.parse(await res.text());
}

// 1. Telegram still works
console.log('\n1. TELEGRAM');
const tg = await sql(`select tg_chat_id, is_active, last_seen_at::text from telegram_chats where is_active=true`);
check('telegram chat is linked + active', tg.length === 1 && tg[0].is_active);
check('chat has been seen recently', !!tg[0]?.last_seen_at, tg[0]?.last_seen_at);
const tgCron = await sql(`select active from cron.job where jobname='telegram-tick'`);
check('telegram-tick cron is active', tgCron[0]?.active === true);
const tgRecent = await sql(`select count(*)::int as n from cron.job_run_details where jobid=(select jobid from cron.job where jobname='telegram-tick') and start_time > now() - interval '5 minutes'`);
check('telegram-tick fired in last 5 min', tgRecent[0].n > 0, `${tgRecent[0].n} runs`);

// 2. Calendar dashboard renders (token valid + Google API responsive)
console.log('\n2. CALENDAR');
const cal = await sql(`select google_email, is_active, last_used_at::text from google_oauth_tokens where is_active=true`);
check('Google Calendar linked', cal.length === 1, cal[0]?.google_email);
const RABIH = 'aa593e81-9efe-4091-b70e-f2fbf907b394';
const tok = (await sql(`select rpc_calendar_get_token('${RABIH}'::uuid) as r`))[0].r;
check('refresh token decryptable from Vault', tok?.connected === true && !!tok.refresh_token);
// Hit Google directly with the access token to confirm it works
const g = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + encodeURIComponent(new Date().toISOString().slice(0,10)+'T00:00:00+02:00') + '&timeMax=' + encodeURIComponent(new Date(Date.now()+86400000).toISOString().slice(0,10)+'T00:00:00+02:00') + '&singleEvents=true&maxResults=5', {
  headers: { Authorization: 'Bearer ' + tok.access_token }
});
check('Google Calendar API responds', g.status === 200, `status ${g.status}`);

// 3. Add/remove calendar event from task
console.log('\n3. ADD/REMOVE CALENDAR');
const auditCalendar = await sql(`select count(*) filter (where action='calendar_event_created') as created, count(*) filter (where action='calendar_event_deleted') as deleted from audit_log where action like 'calendar_event_%'`);
check('calendar_event_created audited at least once', Number(auditCalendar[0].created) > 0, `count=${auditCalendar[0].created}`);
check('calendar_event_deleted audited at least once', Number(auditCalendar[0].deleted) > 0, `count=${auditCalendar[0].deleted}`);

// 4. In-app reminders
console.log('\n4. REMINDERS');
const remCron = await sql(`select active from cron.job where jobname='reminders-drain'`);
check('reminders-drain cron active', remCron[0]?.active === true);
const remRecent = await sql(`select count(*)::int as n from cron.job_run_details where jobid=(select jobid from cron.job where jobname='reminders-drain') and start_time > now() - interval '5 minutes' and status='succeeded'`);
check('reminders-drain succeeded recently', remRecent[0].n > 0, `${remRecent[0].n} successful runs`);

// 5. Fixed tasks
console.log('\n5. FIXED TASKS');
const recCron = await sql(`select active from cron.job where jobname='recurring-spawn'`);
check('recurring-spawn cron active', recCron[0]?.active === true);
// Hourly cron — last run might be up to 60 min ago. Just check it ran successfully sometime.
const recRuns = await sql(`select count(*)::int as n from cron.job_run_details where jobid=(select jobid from cron.job where jobname='recurring-spawn') and status='succeeded'`);
check('recurring-spawn has succeeded at least once', recRuns[0].n > 0, `${recRuns[0].n} historical runs`);

// 6. Dashboard has no demo data for rabih
console.log('\n6. CLEAN DASHBOARD');
const inv = await sql(`
  select 'tasks_live' as k, count(*) as v from tasks where deleted_at is null and is_template=false
  union all select 'follow_ups_live', count(*) from follow_ups where deleted_at is null
  union all select 'inspections_live', count(*) from inspections where deleted_at is null
  union all select 'purchases_live', count(*) from purchase_requests where deleted_at is null
  union all select 'tasks_template', count(*) from tasks where is_template=true and deleted_at is null
  union all select 'calendar_links_live', count(*) from calendar_event_links where deleted_at is null
  union all select 'queue_pending', count(*) from notifications_queue where status in ('pending','dispatching')
`);
const counts = Object.fromEntries(inv.map(x => [x.k, Number(x.v)]));
check('0 live tasks',           counts.tasks_live === 0);
check('0 live follow-ups',      counts.follow_ups_live === 0);
check('0 live inspections',     counts.inspections_live === 0);
check('0 live purchases',       counts.purchases_live === 0);
check('0 live templates',       counts.tasks_template === 0);
check('0 live calendar links',  counts.calendar_links_live === 0);
check('0 pending reminders',    counts.queue_pending === 0);

// 7+8. .env.local + secrets
console.log('\n7. ENV + SECRETS');
const fs = await import('node:fs');
const exec = await import('node:child_process');
try {
  exec.execSync('git check-ignore .env.local', { stdio: 'pipe' });
  check('.env.local gitignored', true);
} catch { check('.env.local gitignored', false, 'git tracks it!'); }
const envText = fs.readFileSync('.env.local', 'utf8');
check('TELEGRAM_BOT_TOKEN present', /TELEGRAM_BOT_TOKEN=/.test(envText));
check('GOOGLE_OAUTH_CLIENT_SECRET present', /GOOGLE_OAUTH_CLIENT_SECRET=/.test(envText));

// Search src/ for known secret patterns
const { spawnSync } = await import('node:child_process');
function grepFiles(pattern, dir) {
  const r = spawnSync('grep', ['-rl', pattern, dir], { encoding: 'utf8' });
  return r.stdout.trim().split('\n').filter(Boolean);
}
check('no GOCSPX- secret in src/', grepFiles('GOCSPX', 'src').length === 0);
check('no AAFMsOiz token in src/', grepFiles('AAFMsOiz', 'src').length === 0);
check('no SUPABASE_SERVICE_ROLE_KEY usage in src/', grepFiles('SUPABASE_SERVICE_ROLE_KEY', 'src').length === 0);
check('no GOOGLE_OAUTH_CLIENT_SECRET in src/', grepFiles('GOOGLE_OAUTH_CLIENT_SECRET', 'src').length === 0);
check('no TELEGRAM_BOT_TOKEN in src/', grepFiles('TELEGRAM_BOT_TOKEN', 'src').length === 0);

// 9. CI green (latest run on main)
console.log('\n9. CI');
if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
  const ciRes = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/actions/runs?per_page=1`, {
    headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' },
  });
  const ci = (await ciRes.json()).workflow_runs[0];
  check('latest CI run completed', ci?.status === 'completed', `status=${ci?.status}`);
  check('latest CI run succeeded',  ci?.conclusion === 'success', `${ci?.head_sha?.substring(0,8)} · ${ci?.conclusion}`);
} else {
  console.log('  · GH token not set; skipping CI check');
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) {
  console.log('Issues:');
  for (const i of issues) console.log('  - ' + i);
  process.exit(1);
}
