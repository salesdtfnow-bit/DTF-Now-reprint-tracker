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
  const orderBit = opts.orderName ? ` for order ${opts.orderName}` : "";
  const subject = `We're reprinting your DTF Now order${orderBit}`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a1d21">
      <h2 style="margin:0 0 12px">Your reprint is underway</h2>
      <p>Hi,</p>
      <p>We're reprinting your DTF Now order${orderBit}. You can follow its progress and get your tracking number here:</p>
      <p style="margin:22px 0">
        <a href="${opts.trackUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block">
          Track my reprint
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">Or paste this link into your browser:<br>${opts.trackUrl}</p>
      <p style="margin-top:24px">Thanks,<br>The DTF Now team</p>
    </div>`;

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
