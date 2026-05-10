// Tiny Telegram Bot API client used by both Edge Functions.
// Bot token comes from env. We only need sendMessage in V1.

export function makeTelegram(botToken: string) {
  const base = `https://api.telegram.org/bot${botToken}`;

  async function sendMessage(chatId: number, text: string): Promise<{ message_id: number }> {
    const res = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        // No parse_mode — we send plain text with emojis. Avoids escaping
        // pitfalls with task titles that may contain Markdown/HTML chars.
        disable_web_page_preview: true,
      }),
    });
    const text2 = await res.text();
    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed (${res.status}): ${text2}`);
    }
    const j = JSON.parse(text2);
    if (!j.ok) {
      throw new Error(`Telegram error: ${j.description ?? 'unknown'}`);
    }
    return { message_id: j.result.message_id as number };
  }

  return { sendMessage };
}
