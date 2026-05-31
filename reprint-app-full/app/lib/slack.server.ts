// Posts reprint alerts to Slack #reprint-request using a bot token
// (chat.postMessage). Set SLACK_BOT_TOKEN in the environment and invite the
// bot to the channel. Threading uses the returned message ts.

const SLACK_API = "https://slack.com/api";

type PostResult = { ok: boolean; ts?: string; error?: string };

async function slackPost(method: string, body: Record<string, unknown>): Promise<PostResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.warn("[slack] SLACK_BOT_TOKEN not set — skipping Slack post");
    return { ok: false, error: "no_token" };
  }
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as PostResult;
  if (!json.ok) console.error(`[slack] ${method} failed:`, json.error);
  return json;
}

const REASON_LABELS: Record<string, string> = {
  misprint: "Misprint",
  colour: "Colour off",
  damage: "Damaged",
  customer_error: "Customer error",
  other: "Other",
};

// Alert staff that a new reprint has been raised. Returns the Slack ts so we
// can thread the completion update later.
export async function postReprintAlert(opts: {
  channelId: string;
  orderName?: string | null;
  reason: string;
  notes?: string | null;
  raisedBy?: string | null;
  appUrl?: string | null; // deep link back into the embedded app
}): Promise<string | null> {
  const lines = [
    `:printer: *New reprint raised*`,
    opts.orderName ? `*Order:* ${opts.orderName}` : null,
    `*Reason:* ${REASON_LABELS[opts.reason] ?? opts.reason}`,
    opts.notes ? `*Notes:* ${opts.notes}` : null,
    opts.raisedBy ? `*Raised by:* ${opts.raisedBy}` : null,
    opts.appUrl ? `<${opts.appUrl}|Open in Reprint Tracker →>` : null,
  ].filter(Boolean);

  const result = await slackPost("chat.postMessage", {
    channel: opts.channelId,
    text: lines.join("\n"),
    unfurl_links: false,
  });
  return result.ok && result.ts ? result.ts : null;
}

// Reply in the alert thread when the job is completed/written off.
export async function postCompletionUpdate(opts: {
  channelId: string;
  threadTs: string;
  reposted: boolean;
  lengthM: number;
  minutes: number;
  completedBy: string;
}): Promise<void> {
  const verb = opts.reposted ? "Reprinted" : "Written off";
  const text =
    `:white_check_mark: *${verb}* — ${opts.lengthM} m, ${opts.minutes} min, by ${opts.completedBy}`;
  await slackPost("chat.postMessage", {
    channel: opts.channelId,
    thread_ts: opts.threadTs,
    text,
  });
}
