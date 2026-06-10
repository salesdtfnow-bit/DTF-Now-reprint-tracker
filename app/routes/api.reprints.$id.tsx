import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

// GET /api/reprints/:id — reprint status for external systems (the helpdesk).
// Protected by the REPRINT_API_KEY shared secret (x-api-key header).
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const key = process.env.REPRINT_API_KEY;
  if (!key || request.headers.get("x-api-key") !== key) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await db.reprintRequest.findUnique({ where: { id: String(params.id) } });
  if (!r) return json({ error: "not found" }, { status: 404 });
  return json({
    id: r.id,
    status: r.status,
    progress: r.progress,
    orderName: r.orderName,
    trackingNumber: r.trackingNumber,
    trackingCarrier: r.trackingCarrier,
    publicToken: r.publicToken,
    customerNotified: r.customerNotified,
    createdAt: r.createdAt,
  });
};
