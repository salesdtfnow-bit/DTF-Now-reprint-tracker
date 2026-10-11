import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { randomBytes } from "crypto";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { getSettings, ensureSeeded } from "../lib/settings.server";
import { listShipping } from "../lib/shipping.server";
import { lookupOrderByName } from "../lib/orders.server";
import { computeLoss, estimateMinutes, REASONS } from "../lib/loss";

// POST /api/reprints/log — log a reprint that has ALREADY been done (staff typing it in Discord #reprints).
// Protected by REPRINT_API_KEY (x-api-key header). Creates a finished record in one go:
// status done (or written_off), length, auto-estimated minutes, re-ship service + real cost.
// No Slack/Discord alert (the Discord bot replies itself) and no customer email.
// Body: { shop, orderName, lengthM, reason, notes?, loggedBy, reshipped?: boolean, shipping?: "default" | "none" | "dpd" | "large_letter" | "special" }
// The order must exist in Shopify, otherwise nothing is saved (422) so typos don't create junk.

const SHIPPING_MATCH: Record<string, (name: string) => boolean> = {
  default: (n) => /^RM Tracked 24 Parcel/i.test(n),
  none: (n) => /no reship/i.test(n),
  dpd: (n) => /^DPD Standard Next Day Parcel/i.test(n),
  large_letter: (n) => /^RM Tracked 24 Large Letter/i.test(n),
  special: (n) => /^RM Special Delivery \(0-0\.999kg\)/i.test(n),
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const key = process.env.REPRINT_API_KEY;
  if (!key || request.headers.get("x-api-key") !== key) return json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, { status: 400 });
  }

  const shop = String(body.shop || "").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return json({ error: "valid shop required" }, { status: 400 });
  const orderNameRaw = String(body.orderName || "").trim();
  if (!orderNameRaw) return json({ error: "order number required" }, { status: 400 });
  const lengthM = Number(body.lengthM);
  if (!Number.isFinite(lengthM) || lengthM <= 0 || lengthM > 100) return json({ error: "length (m) must be between 0 and 100" }, { status: 400 });
  const reason = REASONS.some((r) => r.value === body.reason) ? String(body.reason) : "other";
  const notes = String(body.notes || "").trim().slice(0, 1000) || null;
  const loggedBy = String(body.loggedBy || "Discord").trim().slice(0, 100);
  const reshipped = body.reshipped !== false;
  const shipKey = typeof body.shipping === "string" && body.shipping in SHIPPING_MATCH ? body.shipping : "default";

  // The order must exist (typo guard).
  let order: Awaited<ReturnType<typeof lookupOrderByName>> = null;
  try {
    const { admin } = await unauthenticated.admin(shop);
    order = await lookupOrderByName(admin, orderNameRaw);
  } catch (e) {
    return json({ error: `Shopify lookup failed: ${(e as Error).message}` }, { status: 502 });
  }
  const norm = (n: string) => n.replace(/^#/, "").replace(/\s+/g, "").toUpperCase();
  if (!order || norm(order.name) !== norm(orderNameRaw)) {
    return json({ error: `order ${orderNameRaw} not found in Shopify` }, { status: 422 });
  }

  await ensureSeeded(shop);
  const settings = await getSettings(shop);
  const minutes = estimateMinutes(lengthM, settings);

  let shippingService: string | null = null;
  let shippingCost = 0;
  if (reshipped) {
    const rates = await listShipping(shop);
    const hit = rates.find((r) => SHIPPING_MATCH[shipKey](r.name));
    if (hit) {
      shippingService = hit.name;
      shippingCost = hit.cost;
    }
  }

  const created = await db.reprintRequest.create({
    data: {
      shop,
      orderName: order.name,
      orderGid: order.gid,
      reason,
      notes,
      raisedBy: `${loggedBy} (Discord)`,
      status: reshipped ? "done" : "written_off",
      lengthM,
      minutes,
      reposted: reshipped,
      completedBy: loggedBy,
      completedAt: new Date(),
      shippingService,
      shippingCost,
      publicToken: randomBytes(16).toString("hex"),
      customerEmail: order.email,
    },
  });

  // Same loss rule as the app (computeLoss counts "done" records only).
  const loss = computeLoss({ status: created.status, lengthM, minutes, shippingCost }, settings);

  const storeHandle = shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE;
  const appUrl = appHandle ? `https://admin.shopify.com/store/${storeHandle}/apps/${appHandle}/app/${created.id}` : null;

  return json(
    {
      id: created.id,
      orderName: order.name,
      reason,
      status: created.status,
      lengthM,
      minutes,
      shippingService,
      shippingCost,
      loss,
      appUrl,
      shippingWanted: shipKey,
      shippingFound: !reshipped || Boolean(shippingService),
    },
    { status: 201 },
  );
};
