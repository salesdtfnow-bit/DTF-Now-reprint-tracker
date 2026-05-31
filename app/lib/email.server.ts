// Sends the customer tracking email via Resend (https://resend.com).
// Requires RESEND_API_KEY in the environment. From address defaults to
// sales@dtfnow.co.uk (verify the dtfnow.co.uk domain in Resend first).
// All failures are non-fatal — the reprint is still recorded.

export async function sendTrackingEmail(opts: {
  to: string;
  orderName: string | null;
  trackUrl: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping tracking email");
    return false;
  }
  if (!opts.to) return false;

  const from = process.env.EMAIL_FROM || "DTF Now <support@dtfnow.co.uk>";
  const orderBit = opts.orderName ? ` (order ${opts.orderName})` : "";
  const subject = `Your DTF Now reprint is underway${opts.orderName ? ` — order ${opts.orderName}` : ""}`;
  const url = opts.trackUrl;
  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;margin:0;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="width:540px;max-width:100%;background:#ffffff;border:1px solid #e6e8eb;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1a1d21;padding:18px 28px;">
          <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px;">DTF&nbsp;Now</span>
        </td></tr>
        <tr><td style="padding:30px 28px;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#1a1d21;">Your reprint is underway</h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3c4043;">Hi,</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3c4043;">
            We're sorry for any inconvenience with your order${orderBit}. We've got it covered — your reprint is already in production and on its way to you.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#3c4043;">
            You can follow its progress and get your tracking number any time using the button below.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="background:#2563eb;border-radius:8px;">
              <a href="${url}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Track my reprint</a>
            </td>
          </tr></table>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">Or paste this link into your browser:<br>
            <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
          </p>
          <p style="margin:28px 0 0;font-size:15px;line-height:1.55;color:#3c4043;">Thank you for your patience,<br>The DTF Now team</p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eef0f2;">
          <span style="font-size:12px;color:#9ca3af;">Questions? Just reply to this email and we'll be happy to help.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [opts.to], subject, html }),
    });
    if (!res.ok) {
      console.error("[email] Resend failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] Resend error:", e);
    return false;
  }
}
