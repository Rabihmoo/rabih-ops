const {
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  PR_NUMBER,
  OPENAI_API_KEY,
  OPENAI_REVIEW_MODEL = 'gpt-4.1',
  GITHUB_API_URL = 'https://api.github.com',
} = process.env;

const MARKER = '<!-- rabih-ops-ai-pr-review -->';
const MAX_DIFF_CHARS = 120_000;

function required(name, value) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function gh(path, init = {}) {
  const token = required('GITHUB_TOKEN', GITHUB_TOKEN);
  const repo = required('GITHUB_REPOSITORY', GITHUB_REPOSITORY);
  const url = `${GITHUB_API_URL}/repos/${repo}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} ${path}: ${await res.text()}`);
  }
  return res;
}

async function getPullRequest() {
  const pr = required('PR_NUMBER', PR_NUMBER);
  const res = await gh(`/pulls/${encodeURIComponent(pr)}`);
  return res.json();
}

async function getPullRequestDiff() {
  const pr = required('PR_NUMBER', PR_NUMBER);
  const res = await gh(`/pulls/${encodeURIComponent(pr)}`, {
    headers: { Accept: 'application/vnd.github.v3.diff' },
  });
  return res.text();
}

async function getChangedFiles() {
  const pr = required('PR_NUMBER', PR_NUMBER);
  const res = await gh(`/pulls/${encodeURIComponent(pr)}/files?per_page=100`);
  return res.json();
}

function truncateDiff(diff) {
  if (diff.length <= MAX_DIFF_CHARS) {
    return { diff, truncated: false };
  }
  return {
    diff: diff.slice(0, MAX_DIFF_CHARS),
    truncated: true,
  };
}

function buildPrompt({ pr, files, diff, truncated }) {
  const fileList = files
    .map((f) => `- ${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join('\n');

  return `
You are reviewing a pull request for Rabih Ops, an operations-management app.

Project rules that matter most:
- Mutations must go through SECURITY DEFINER RPCs; no direct client table writes.
- RLS must stay enabled; writes should not be exposed through policies.
- Keep changes scoped. Avoid broad refactors.
- Flag missing tests for user-facing flows, RPC/schema changes, and permission-sensitive paths.
- Be especially careful with Supabase migrations, Edge Functions, Gmail/Calendar/Telegram integrations, reminders, and role/branch permissions.

Review style:
- Lead with concrete findings ordered by severity.
- Include file paths and exact code references when visible from the diff.
- If there are no blocking issues, say so clearly.
- Keep it concise and actionable.
- Do not ask for changes unrelated to this PR.

PR:
Title: ${pr.title}
Author: ${pr.user?.login ?? 'unknown'}
Base: ${pr.base?.ref ?? 'unknown'}
Head: ${pr.head?.ref ?? 'unknown'}

Changed files:
${fileList || '(none)'}

${truncated ? `NOTE: diff was truncated to ${MAX_DIFF_CHARS} characters. Mention this limitation in residual risk.\n` : ''}

Diff:
\`\`\`diff
${diff}
\`\`\`
`.trim();
}

async function askOpenAI(prompt) {
  const apiKey = required('OPENAI_API_KEY', OPENAI_API_KEY);
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_REVIEW_MODEL,
      instructions:
        'You are a senior engineering reviewer. Produce a concise GitHub PR review in Markdown.',
      input: prompt,
      store: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (typeof json.output_text === 'string' && json.output_text.trim()) {
    return json.output_text.trim();
  }
  const text = (json.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('OpenAI response did not contain review text');
  return text;
}

async function upsertComment(body) {
  const pr = required('PR_NUMBER', PR_NUMBER);
  const commentsRes = await gh(`/issues/${encodeURIComponent(pr)}/comments?per_page=100`);
  const comments = await commentsRes.json();
  const existing = comments.find(
    (c) => c.user?.type === 'Bot' && typeof c.body === 'string' && c.body.includes(MARKER),
  );
  const fullBody = `${MARKER}\n${body}`;
  if (existing) {
    await gh(`/issues/comments/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: fullBody }),
      headers: { 'Content-Type': 'application/json' },
    });
    return;
  }
  await gh(`/issues/${encodeURIComponent(pr)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: fullBody }),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY is not configured; skipping AI PR review.');
    return;
  }

  const [pr, files, rawDiff] = await Promise.all([
    getPullRequest(),
    getChangedFiles(),
    getPullRequestDiff(),
  ]);

  if (pr.draft) {
    console.log('Draft PR; skipping AI PR review.');
    return;
  }

  const { diff, truncated } = truncateDiff(rawDiff);
  const prompt = buildPrompt({ pr, files, diff, truncated });
  const review = await askOpenAI(prompt);
  const sha = pr.head?.sha ? pr.head.sha.slice(0, 7) : 'unknown';
  const body = [
    `## AI PR Review`,
    ``,
    `Model: \`${OPENAI_REVIEW_MODEL}\``,
    `Head: \`${sha}\``,
    ``,
    review,
  ].join('\n');
  await upsertComment(body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
