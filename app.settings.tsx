import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import {
  Page, Card, IndexTable, Badge, Text, Button, InlineGrid, BlockStack,
  ButtonGroup, EmptyState, Banner,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getSettings } from "../lib/settings.server";
import { computeLoss, gbp, REASONS } from "../lib/loss";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const filter = url.searchParams.get("status") ?? "all";

  const where: any = { shop };
  if (filter === "pending") where.status = "pending";
  if (filter === "done") where.status = { in: ["done", "written_off"] };

  const [requests, settings] = await Promise.all([
    db.reprintRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    getSettings(shop),
  ]);

  const done = await db.reprintRequest.findMany({ where: { shop, status: "done" } });
  const rates = settings;
  const totalLoss = done.reduce((s, r) => s + computeLoss(r, rates).total, 0);
  const metres = done.reduce((s, r) => s + (r.lengthM ?? 0), 0);
  const minutes = done.reduce((s, r) => s + (r.minutes ?? 0), 0);
  const pendingCount = await db.reprintRequest.count({ where: { shop, status: "pending" } });

  return {
    requests: requests.map((r) => ({ ...r, loss: computeLoss(r, rates).total })),
    rates,
    kpis: { totalLoss, metres, hours: minutes / 60, completed: done.length, pendingCount },
    filter,
  };
};

const reasonLabel = (v: string) => REASONS.find((r) => r.value === v)?.label ?? v;

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") return <Badge tone="attention">Pending</Badge>;
  if (status === "written_off") return <Badge tone="critical">Written off</Badge>;
  return <Badge tone="success">Finished</Badge>;
}

export default function Index() {
  const { requests, kpis, filter } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [active] = useState(filter);

  const kpiCards = [
    { label: "Open requests", value: String(kpis.pendingCount) },
    { label: "Completed", value: String(kpis.completed) },
    { label: "Film used", value: `${kpis.metres.toFixed(1)} m` },
    { label: "Time lost", value: `${kpis.hours.toFixed(1)} h` },
    { label: "True loss", value: gbp(kpis.totalLoss) },
  ];

  const rowMarkup = requests.map((r, i) => (
    <IndexTable.Row id={r.id} key={r.id} position={i} onClick={() => navigate(`/app/${r.id}`)}>
      <IndexTable.Cell>{r.orderName ?? "—"}</IndexTable.Cell>
      <IndexTable.Cell>{reasonLabel(r.reason)}</IndexTable.Cell>
      <IndexTable.Cell>{r.raisedBy ?? "—"}</IndexTable.Cell>
      <IndexTable.Cell><StatusBadge status={r.status} /></IndexTable.Cell>
      <IndexTable.Cell>{r.lengthM != null ? `${r.lengthM} m` : "—"}</IndexTable.Cell>
      <IndexTable.Cell>{r.status === "done" ? gbp(r.loss) : "—"}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Reprints"
      primaryAction={{ content: "Raise reprint", onAction: () => navigate("/app/new") }}
    >
      <BlockStack gap="400">
        <InlineGrid columns={{ xs: 2, sm: 3, md: 5 }} gap="300">
          {kpiCards.map((c) => (
            <Card key={c.label}>
              <BlockStack gap="100">
                <Text as="span" variant="bodySm" tone="subdued">{c.label}</Text>
                <Text as="span" variant="headingLg">{c.value}</Text>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>

        <Card padding="0">
          <div style={{ padding: "12px 16px" }}>
            <ButtonGroup variant="segmented">
              {[
                { k: "all", l: "All" },
                { k: "pending", l: "Pending" },
                { k: "done", l: "Finished" },
              ].map((f) => (
                <Button
                  key={f.k}
                  pressed={active === f.k}
                  onClick={() => setSearchParams(f.k === "all" ? {} : { status: f.k })}
                >
                  {f.l}
                </Button>
              ))}
            </ButtonGroup>
          </div>
          {requests.length === 0 ? (
            <EmptyState
              heading="No reprints yet"
              action={{ content: "Raise reprint", onAction: () => navigate("/app/new") }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>When staff raise a reprint, it appears here and an alert is posted to Slack #reprint-request.</p>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "reprint", plural: "reprints" }}
              itemCount={requests.length}
              selectable={false}
              headings={[
                { title: "Order" }, { title: "Reason" }, { title: "Raised by" },
                { title: "Status" }, { title: "Length" }, { title: "True loss" },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
