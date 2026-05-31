import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page, Card, BlockStack, InlineGrid, Text, Badge, TextField, Select, Button,
  FormLayout, Divider, Box, Link,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getSettings, ensureSeeded } from "../lib/settings.server";
import { listEmployees } from "../lib/employees.server";
import { listShipping } from "../lib/shipping.server";
import { lookupOrderByName } from "../lib/orders.server";
import { postCompletionUpdate } from "../lib/slack.server";
import { computeLoss, estimateMinutes, gbp, REASONS } from "../lib/loss";
import { isUnlocked, pinConfigured } from "../lib/pin.server";

function orderAdminUrl(
  shop: string,
  orderName: string | null,
  orderGid: string | null,
): string | null {
  const handle = shop.replace(".myshopify.com", "");
  if (orderGid) {
    const id = orderGid.split("/").pop();
    if (id) return `https://admin.shopify.com/store/${handle}/orders/${id}`;
  }
  if (orderName) {
    return `https://admin.shopify.com/store/${handle}/orders?query=${encodeURIComponent(
      orderName.replace(/^#/, ""),
    )}`;
  }
  return null;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  await ensureSeeded(shop);
  const r = await db.reprintRequest.findFirst({ where: { id: params.id, shop } });
  if (!r) throw new Response("Not found", { status: 404 });

  const [settings, employees, shipping] = await Promise.all([
    getSettings(shop),
    listEmployees(shop),
    listShipping(shop),
  ]);

  let order = null;
  if (r.orderName) {
    try { order = await lookupOrderByName(admin, r.orderName); } catch (e) { /* ignore */ }
  }
  return {
    r,
    order,
    orderUrl: orderAdminUrl(shop, r.orderName, r.orderGid ?? order?.gid ?? null),
    loss: computeLoss(r, settings),
    employees: employees.map((e) => e.name),
    shipping: shipping.map((s) => ({ name: s.name, cost: s.cost })),
    time: {
      processingMin: settings.processingMin,
      ripMinPerM: settings.ripMinPerM,
      printSpeedMph: settings.printSpeedMph,
      packMin: settings.packMin,
    },
    // Cost breakdown is only shown to PIN-holders; staff see the Loss total only.
    showCosts: !pinConfigured() || (await isUnlocked(request)),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const r = await db.reprintRequest.findFirst({ where: { id: params.id, shop } });
  if (!r) throw new Response("Not found", { status: 404 });

  const lengthM = parseFloat(String(form.get("lengthM")));
  const minutes = parseFloat(String(form.get("minutes")));
  const reposted = String(form.get("reposted")) === "yes";
  const completedBy = String(form.get("completedBy") ?? "").trim() || "unknown";
  const shippingService = String(form.get("shippingService") ?? "").trim() || null;
  const shippingCostRaw = parseFloat(String(form.get("shippingCost")));
  const shippingCost = Number.isFinite(shippingCostRaw) ? shippingCostRaw : 0;

  if (!Number.isFinite(lengthM) || lengthM < 0) return { error: "Enter a valid length (m)." };
  if (!Number.isFinite(minutes) || minutes < 0) return { error: "Enter a valid time (mins)." };

  const updated = await db.reprintRequest.update({
    where: { id: r.id },
    data: {
      status: reposted ? "done" : "written_off",
      lengthM, minutes, reposted, completedBy,
      shippingService, shippingCost,
      completedAt: new Date(),
    },
  });

  // Mirror completion to the Slack alert thread (best-effort).
  if (r.slackTs) {
    const settings = await getSettings(shop);
    try {
      await postCompletionUpdate({
        channelId: settings.slackChannelId, threadTs: r.slackTs,
        reposted, lengthM, minutes, completedBy,
      });
    } catch (e) { /* non-fatal */ }
  }

  return redirect(`/app/${updated.id}`);
};

const reasonLabel = (v: string) => REASONS.find((x) => x.value === v)?.label ?? v;

export default function Detail() {
  const { r, order, orderUrl, loss, employees, shipping, time, showCosts } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const submitting = nav.state === "submitting";
  const isOpen = r.status === "pending";

  const shippingCostByName: Record<string, number> = {};
  shipping.forEach((s) => { shippingCostByName[s.name] = s.cost; });

  const estimate = (len: string) => String(estimateMinutes(parseFloat(len), time));

  const [lengthM, setLength] = useState(r.lengthM != null ? String(r.lengthM) : "");
  const [minutes, setMinutes] = useState(
    r.minutes != null ? String(r.minutes) : (r.lengthM != null ? estimate(String(r.lengthM)) : ""),
  );

  // Auto-fill the time estimate whenever length changes (still editable).
  const onLengthChange = (v: string) => {
    setLength(v);
    setMinutes(v ? estimate(v) : "");
  };
  const [reposted, setReposted] = useState(r.reposted === false ? "no" : "yes");
  const [completedBy, setCompletedBy] = useState(r.completedBy ?? "");
  const [shippingService, setShippingService] = useState(
    r.shippingService ?? (shipping[0]?.name ?? ""),
  );

  const doSubmit = () => {
    const fd = new FormData();
    fd.set("lengthM", lengthM);
    fd.set("minutes", minutes);
    fd.set("reposted", reposted);
    fd.set("completedBy", completedBy);
    fd.set("shippingService", shippingService);
    fd.set("shippingCost", String(shippingCostByName[shippingService] ?? 0));
    submit(fd, { method: "post" });
  };

  const employeeOptions = [
    { label: "Select employee…", value: "" },
    ...employees.map((n) => ({ label: n, value: n })),
  ];
  const shippingOptions = shipping.map((s) => ({
    label: s.cost > 0 ? `${s.name} — ${gbp(s.cost)}` : s.name,
    value: s.name,
  }));

  return (
    <Page
      title={`Reprint ${r.orderName ?? ""}`.trim()}
      backAction={{ content: "Reprints", url: "/app" }}
      titleMetadata={
        r.status === "pending" ? <Badge tone="attention">Pending</Badge>
        : r.status === "written_off" ? <Badge tone="critical">Written off</Badge>
        : <Badge tone="success">Finished</Badge>
      }
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Request</Text>
            <InlineGrid columns={2} gap="300">
              <Box>
                <Text as="span" tone="subdued">Order</Text>
                <div>
                  {r.orderName
                    ? (orderUrl
                        ? <Link url={orderUrl} target="_top">{r.orderName}</Link>
                        : r.orderName)
                    : "—"}
                </div>
              </Box>
              <Box><Text as="span" tone="subdued">Reason</Text><div>{reasonLabel(r.reason)}</div></Box>
              <Box><Text as="span" tone="subdued">Raised by</Text><div>{r.raisedBy ?? "—"}</div></Box>
            </InlineGrid>
            {r.notes ? <Box><Text as="span" tone="subdued">Notes</Text><div>{r.notes}</div></Box> : null}
          </BlockStack>
        </Card>

        {order ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Linked order {orderUrl ? <Link url={orderUrl} target="_top">{order.name}</Link> : order.name}
              </Text>
              <InlineGrid columns={2} gap="300">
                <Box><Text as="span" tone="subdued">Customer</Text><div>{order.customer ?? "—"}</div></Box>
                <Box><Text as="span" tone="subdued">Order total</Text><div>{gbp(parseFloat(order.totalPrice))}</div></Box>
              </InlineGrid>
              <Text as="p" variant="bodySm" tone="subdued">
                Shown for context — order value is not added to true loss.
              </Text>
            </BlockStack>
          </Card>
        ) : null}

        {isOpen ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Complete this reprint</Text>
              <FormLayout>
                <FormLayout.Group>
                  <TextField label="Reprint length (m)" type="number" value={lengthM}
                    onChange={onLengthChange} autoComplete="off" min={0} step={0.1}
                    helpText="Drives the auto time estimate." />
                  <TextField label="Time taken (mins)" type="number" value={minutes}
                    onChange={setMinutes} autoComplete="off" min={0} step={0.1}
                    helpText="Auto-calculated from length — edit if it differs." />
                </FormLayout.Group>
                <Select label="Outcome" value={reposted} onChange={setReposted}
                  options={[
                    { label: "Reprinted", value: "yes" },
                    { label: "Written off (not rerun)", value: "no" },
                  ]} />
                <Select label="Reshipping (carrier cost added to loss)" value={shippingService}
                  onChange={setShippingService} options={shippingOptions} />
                <Select label="Completed by" value={completedBy}
                  onChange={setCompletedBy} options={employeeOptions} />
                <Button variant="primary" loading={submitting} onClick={doSubmit}>
                  Save &amp; mark finished
                </Button>
              </FormLayout>
            </BlockStack>
          </Card>
        ) : (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Completion</Text>
              <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
                <Box><Text as="span" tone="subdued">Length</Text><div>{r.lengthM} m</div></Box>
                <Box><Text as="span" tone="subdued">Time</Text><div>{r.minutes} min</div></Box>
                <Box><Text as="span" tone="subdued">Outcome</Text><div>{r.reposted ? "Reprinted" : "Written off"}</div></Box>
                <Box><Text as="span" tone="subdued">Reshipping</Text><div>{r.shippingService ?? "—"}</div></Box>
              </InlineGrid>
              <Divider />
              {showCosts ? (
                <InlineGrid columns={{ xs: 2, sm: 5 }} gap="300">
                  <Box><Text as="span" tone="subdued">Material</Text><div>{gbp(loss.material)}</div></Box>
                  <Box><Text as="span" tone="subdued">Labour</Text><div>{gbp(loss.labour)}</div></Box>
                  <Box><Text as="span" tone="subdued">Machine</Text><div>{gbp(loss.machine)}</div></Box>
                  <Box><Text as="span" tone="subdued">Shipping</Text><div>{gbp(loss.shipping)}</div></Box>
                  <Box><Text as="span" variant="headingSm">Loss</Text><div><Text as="span" variant="headingSm">{gbp(loss.total)}</Text></div></Box>
                </InlineGrid>
              ) : (
                <Box><Text as="span" variant="headingSm">Loss</Text><div><Text as="span" variant="headingMd">{gbp(loss.total)}</Text></div></Box>
              )}
              <Text as="p" variant="bodySm" tone="subdued">Completed by {r.completedBy} on {r.completedAt ? new Date(r.completedAt).toLocaleDateString("en-GB") : "—"}</Text>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
