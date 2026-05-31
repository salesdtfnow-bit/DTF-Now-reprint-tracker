import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, BlockStack, InlineGrid, Text, DataTable } from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getSettings } from "../lib/settings.server";
import { computeLoss, gbp, REASONS } from "../lib/loss";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getSettings(shop);
  const done = await db.reprintRequest.findMany({ where: { shop, status: "done" } });

  const byReason: Record<string, { count: number; loss: number; metres: number }> = {};
  const byStaff: Record<string, { count: number; loss: number }> = {};
  let totalLoss = 0, totalMetres = 0, totalMinutes = 0;
  let lossPrint = 0, lossLabour = 0, lossMachine = 0, lossShipping = 0;

  for (const r of done) {
    const L = computeLoss(r, settings);
    totalLoss += L.total; totalMetres += r.lengthM ?? 0; totalMinutes += r.minutes ?? 0;
    lossPrint += L.material; lossLabour += L.labour; lossMachine += L.machine; lossShipping += L.shipping;
    const rk = r.reason;
    byReason[rk] = byReason[rk] ?? { count: 0, loss: 0, metres: 0 };
    byReason[rk].count++; byReason[rk].loss += L.total; byReason[rk].metres += r.lengthM ?? 0;
    const sk = r.completedBy ?? "unknown";
    byStaff[sk] = byStaff[sk] ?? { count: 0, loss: 0 };
    byStaff[sk].count++; byStaff[sk].loss += L.total;
  }

  const reasonLabel = (v: string) => REASONS.find((x) => x.value === v)?.label ?? v;
  return {
    settings,
    totals: { totalLoss, totalMetres, totalHours: totalMinutes / 60, count: done.length },
    breakdown: { lossPrint, lossLabour, lossMachine, lossShipping },
    reasonRows: Object.entries(byReason)
      .sort((a, b) => b[1].loss - a[1].loss)
      .map(([k, v]) => [reasonLabel(k), String(v.count), `${v.metres.toFixed(1)} m`, gbp(v.loss)]),
    staffRows: Object.entries(byStaff)
      .sort((a, b) => b[1].loss - a[1].loss)
      .map(([k, v]) => [k, String(v.count), gbp(v.loss)]),
  };
};

export default function Reports() {
  const { settings, totals, breakdown, reasonRows, staffRows } = useLoaderData<typeof loader>();
  const cards = [
    { label: "Completed reprints", value: String(totals.count) },
    { label: "Time lost", value: `${totals.totalHours.toFixed(1)} h` },
    { label: "Shipping lost", value: gbp(breakdown.lossShipping) },
    { label: "Total true loss", value: gbp(totals.totalLoss) },
  ];
  return (
    <Page title="Reports">
      <BlockStack gap="400">
        <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
          {cards.map((c) => (
            <Card key={c.label}>
              <BlockStack gap="100">
                <Text as="span" variant="bodySm" tone="subdued">{c.label}</Text>
                <Text as="span" variant="headingLg">{c.value}</Text>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">True loss breakdown</Text>
            <DataTable
              columnContentTypes={["text", "numeric"]}
              headings={["Component", "Total"]}
              rows={[
                ["Material (film)", gbp(breakdown.lossPrint)],
                ["Labour", gbp(breakdown.lossLabour)],
                ["Machine time", gbp(breakdown.lossMachine)],
                ["Shipping (reship)", gbp(breakdown.lossShipping)],
                ["True loss", gbp(totals.totalLoss)],
              ]}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">True loss by reason</Text>
            <DataTable
              columnContentTypes={["text", "numeric", "numeric", "numeric"]}
              headings={["Reason", "Count", "Film", "True loss"]}
              rows={reasonRows.length ? reasonRows : [["No completed reprints yet", "", "", ""]]}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">True loss by staff (completed by)</Text>
            <DataTable
              columnContentTypes={["text", "numeric", "numeric"]}
              headings={["Staff", "Count", "True loss"]}
              rows={staffRows.length ? staffRows : [["No completed reprints yet", "", ""]]}
            />
          </BlockStack>
        </Card>

        <Text as="p" variant="bodySm" tone="subdued">
          Rates: film {gbp(settings.filmPerM)}/m, labour {gbp(settings.labourPerH)}/h, machine {gbp(settings.machinePerH)}/h. Shipping uses the real carrier cost per reship. Change them in Settings.
        </Text>
      </BlockStack>
    </Page>
  );
}
