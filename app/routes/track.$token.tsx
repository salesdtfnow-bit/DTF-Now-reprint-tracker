import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

import db from "../db.server";
import { PROGRESS_STAGES, progressIndex, carrierTrackUrl, carrierLabel } from "../lib/tracking";

export const meta: MetaFunction = () => [{ title: "Track your reprint — DTF Now" }];

// PUBLIC route — no Shopify auth. Only customer-safe fields are returned.
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = params.token;
  if (!token) throw new Response("Not found", { status: 404 });
  const r = await db.reprintRequest.findUnique({ where: { publicToken: token } });
  if (!r) throw new Response("Not found", { status: 404 });
  return {
    orderName: r.orderName,
    progress: r.progress,
    trackingNumber: r.trackingNumber,
    trackUrl: carrierTrackUrl(r.trackingCarrier, r.trackingNumber),
    carrier: r.trackingCarrier,
  };
};

export default function Track() {
  const d = useLoaderData<typeof loader>();
  const currentIdx = progressIndex(d.progress);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f8", margin: 0,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      color: "#1a1d21", padding: "32px 16px" }}>
      <div style={{ maxWidth: 540, margin: "0 auto", background: "#fff", border: "1px solid #e6e8eb",
        borderRadius: 14, padding: "28px 26px", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>DTF Now</div>
        <div style={{ color: "#6b7280", marginBottom: 22 }}>
          Reprint status{d.orderName ? ` for order ${d.orderName}` : ""}
        </div>

        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {PROGRESS_STAGES.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            const color = done ? "#16a34a" : active ? "#2563eb" : "#cbd5e1";
            return (
              <li key={s.value} style={{ display: "flex", alignItems: "center", gap: 14,
                padding: "10px 0", opacity: i <= currentIdx ? 1 : 0.55 }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: color,
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, flexShrink: 0 }}>
                  {done ? "✓" : i + 1}
                </span>
                <span style={{ fontWeight: active ? 700 : 500,
                  fontSize: 16, color: i <= currentIdx ? "#1a1d21" : "#9ca3af" }}>
                  {s.label}
                  {active ? <span style={{ color: "#2563eb", fontWeight: 600 }}> — current</span> : null}
                </span>
              </li>
            );
          })}
        </ol>

        {d.trackingNumber ? (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #eef0f2" }}>
            <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 4 }}>Tracking number</div>
            <div style={{ fontSize: 17, fontWeight: 650, marginBottom: 10 }}>{d.trackingNumber}</div>
            {d.trackUrl ? (
              <a href={d.trackUrl} target="_blank" rel="noreferrer"
                style={{ background: "#2563eb", color: "#fff", textDecoration: "none",
                  padding: "10px 18px", borderRadius: 8, display: "inline-block", fontSize: 14 }}>
                Track with {carrierLabel(d.carrier)}
              </a>
            ) : null}
          </div>
        ) : (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #eef0f2",
            color: "#6b7280", fontSize: 14 }}>
            Your tracking number will appear here once your reprint is dispatched.
          </div>
        )}

        <div style={{ marginTop: 24, color: "#9ca3af", fontSize: 12 }}>
          Questions? Reply to your DTF Now order email and we'll help.
        </div>
      </div>
    </div>
  );
}
