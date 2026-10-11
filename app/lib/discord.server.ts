// Posts reprint alerts to Discord #reprints through a channel webhook.
// Set DISCORD_REPRINT_WEBHOOK_URL (Discord: #reprints → Edit Channel → Integrations → Webhooks).
// No-op if it isn't set. Never pings anyone (allowed_mentions is empty).

const MAX = 2000;

// User-typed text (notes, names) must not change the formatting.
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/[\\*_~`|[\]()]/g, (c) => "\\" + c)
    .replace(/\s+/g, " ")
    .trim();
}

export async function postDiscord(content: string): Promise<boolean> {
  const url = process.env.DISCORD_REPRINT_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "DTF Now Reprint Tracker",
        content: content.length > MAX ? content.slice(0, MAX - 1) + "…" : content,
        allowed_mentions: { parse: [] },
      }),
    });
    if (!res.ok) console.error("[discord] post failed:", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("[discord] post failed:", (e as Error).message);
    return false;
  }
}
