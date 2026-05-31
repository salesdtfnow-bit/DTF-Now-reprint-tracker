import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page, Card, BlockStack, InlineGrid, Text, Badge, TextField, Select, Button,
  FormLayout, Divider, Box,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getSettings } from "../lib/settings.server";
import { lookupOrderByName } from "../lib/orders.server";
import { postCompletionUpdate } from "../lib/slack.server";
import { computeLoss, gbp, REASONS } from "../lib/loss";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const r = await db.reprintRequest.findFirst({ where: { id: params.id, shop } });
  if (!r) throw new Response("Not found", { status: 404 });

  const settings = await getSettings(shop);
  let order = null;
  if (r.orderName) {
    try { order = await lookupOrderByName(admin, r.orderName); } catch (e) { /* ignore */ }
  }
  return { r, order, rates: settings, loss: computeLoss(r, settings) };
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

  if (!Number.isFinite(lengthM) || lengthM < 0) return { error: "Enter a valid length (m)." };
  if (!Number.isFinite(minutes) || minutes < 0) return { error: "Enter a valid time (mins)." };

  const updated = await db.reprintRequest.update({
    where: { id: r.id },
    data: {
      status: reposted ? "done" : "written_off",
      lengthM, minutes, reposted, completedBy, completedAt: new Date(),
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
  const { r, order, loss } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const submitting = nav.state === "submitting";
  const isOpen = r.status === "pending";

  const [lengthM, setLength] = useState(r.lengthM != null ? String(r.lengthM) : "");
  const [minutes, setMinutes] = useState(r.minutes != null ? String(r.minutes) : "");
  const [reposted, setReposted] = useState(r.reposted === false ? "no" : "yes");
  const [completedBy, setCompletedBy] = useState(r.completedBy ?? "");

  const doSubmit = () => {
    const fd = new FormData();
    fd.set("lengthM", lengthM); fd.set("minutes", minutes);
    fd.set("reposted", reposted); fd.set("completedBy", completedBy);
    submit(fd, { method: "post" });
  };

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
              <Box><Text as="span" tone="subdued">Reason</Text><div>{reasonLabel(r.reason)}</div></Box>
              <Box><Text as="span" tone="subdued">Raised by</Text><div>{r.raisedBy ?? "—"}</div></Box>
            </InlineGrid>
            {r.notes ? <Box><Text as="span" tone="subdued">Notes</Text><div>{r.notes}</div></Box> : null}
          </BlockStack>
        </Card>

        {order ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Linked order {order.name}</Text>
              <InlineGrid columns={2} gap="300">
                <Box><Text as="span" tone="subdued">Customer</Text><div>{order.customer ?? "—"}</div></Box>
                <Box><Text as="span" tone="subdued">Order total</Text><div>{gbp(parseFloat(order.totalPrice))}</div></Box>
              </InlineGrid>
              <Text as="p" variant="bodySm" tone="subdued">
                Shown for context — order value is not added to true loss (reprint cost only).
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
                    onChange={setLength} autoComplete="off" min={0} step={0.1} />
                  <TextField label="Time taken (mins)" type="number" value={minutes}
                    onChange={setMinutes} autoComplete="off" min={0} step={1} />
                </FormLayout.Group>
                <Select label="Outcome" value={reposted}
                  onChange={setReposted}
                  options={[
                    { label: "Reprinted", value: "yes" },
                    { label: "Written off (not rerun)", value: "no" },
                  ]} />
                <TextField label="Completed by" value={completedBy} onChange={setCompletedBy} autoComplete="off" />
                <Button variant="primary" loading={submitting} onClick={doSubmit}>
                  Save & mark finished
                </Button>
              </FormLayout>
            </BlockStack>
          </Card>
        ) : (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Completion</Text>
              <InlineGrid columns={3} gap="300">
                <Box><Text as="span" tone="subdued">Length</Text><div>{r.lengthM} m</div></Box>
                <Box><Text as="span" tone="subdued">Time</Text><div>{r.minutes} min</div></Box>
                <Box><Text as="span" tone="subdued">Outcome</Text><div>{r.reposted ? "Reprinted" : "Written off"}</div></Box>
              </InlineGrid>
              <Divider />
              <InlineGrid columns={4} gap="300">
                <Box><Text as="span" tone="subdued">Material</Text><div>{gbp(loss.material)}</div></Box>
                <Box><Text as="span" tone="subdued">Labour</Text><div>{gbp(loss.labour)}</div></Box>
                <Box><Text as="span" tone="subdued">Machine</Text><div>{gbp(loss.machine)}</div></Box>
                <Box><Text as="span" variant="headingSm">True loss</Text><div><Text as="span" variant="headingSm">{gbp(loss.total)}</Text></div></Box>
              </InlineGrid>
              <Text as="p" variant="bodySm" tone="subdued">Completed by {r.completedBy} on {r.completedAt ? new Date(r.completedAt).toLocaleDateString("en-GB") : "—"}</Text>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
