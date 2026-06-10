import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { randomBytes } from "crypto";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { getSettings } from "../lib/settings.server";
import { postReprintAlert } from "../lib/slack.server";
import { lookupOrderByName } from "../lib/orders.server";
import { sendTrackingEmail } from "../lib/email.server";

// POST /api/reprints — create a reprint from an external system (the helpdesk).
// Protected by the REPRINT_API_KEY shared secret (x-api-key header).
// Body: { shop, orderName?, reason?, notes?, raisedBy?, notify?, customerEmail? }
// Reuses the same flow as the admin UI: order lookup, Slack alert, tracking email.

function authorized(request: Request) {
  const key = process.env.REPRINT_API_KEY;
  return Boolean(key && request.headers.get("x-api-key") === key);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, { status: 405 });
  }
  if (!authorized(request)) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, { status: 400 });
  }

  const shop = String(body.shop || "").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return json({ error: "valid shop required" }, { status: 400 });
  }

  const orderNameRaw = String(body.orderName || "").trim();
  const reason = String(body.reason || "other");
  const notes = String(body.notes || "").trim();
  const raisedBy = String(body.raisedBy || "Helpdesk").trim();
  const notify = body.notify !== false && body.notify !== "no";

  let orderName: string | null = orderNameRaw || null;
  let orderGid: string | null = null;
  let customerEmail: string | null = String(body.customerEmail || "").trim() || null;

  if (orderNameRaw) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const ord = await lookupOrderByName(admin, orderNameRaw);
      if (ord) {
        orderName = ord.name;
        orderGid = ord.gid;
        customerEmail = ord.email || customerEmail;
      }
    } catch (e) {
      // non-fatal: keep the provided name/email even if lookup fails
    }
  }

  const settings = await getSettings(shop);
  const publicToken = randomBytes(16).toString("hex");

  const created = await db.reprintRequest.create({
    data: {
      shop,
      orderName,
      orderGid,
      reason,
      notes: notes || null,
      raisedBy: raisedBy || null,
      publicToken,
      customerEmail,
    },
  });

  const storeHandle = shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE;
  const appUrl = appHandle
    ? `https://admin.shopify.com/store/${storeHandle}/apps/${appHandle}/app/${created.id}`
    : null;

  const ts = await postReprintAlert({
    channelId: settings.slackChannelId,
    orderName,
    reason,
    notes: notes || null,
    raisedBy: raisedBy || null,
    appUrl,
  });
  if (ts) {
    await db.reprintRequest.update({ where: { id: created.id }, data: { slackTs: ts } });
  }

  const base = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const trackUrl = base ? `${base}/track/${publicToken}` : null;
  let customerNotified = false;
  if (notify && customerEmail && trackUrl) {
    const ok = await sendTrackingEmail({ to: customerEmail, orderName, trackUrl });
    if (ok) {
      customerNotified = true;
      await db.reprintRequest.update({
        where: { id: created.id },
        data: { customerNotified: true },
      });
    }
  }

  return json(
    {
      id: created.id,
      publicToken,
      trackUrl,
      orderName,
      customerEmail,
      customerNotified,
      status: created.status,
      progress: created.progress,
    },
    { status: 201 }
  );
};
