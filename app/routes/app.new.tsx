import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page, Card, FormLayout, TextField, Select, Button, BlockStack, Banner, Text,
} from "@shopify/polaris";

import { randomBytes } from "crypto";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getSettings } from "../lib/settings.server";
import { postReprintAlert } from "../lib/slack.server";
import { lookupOrderByName } from "../lib/orders.server";
import { sendTrackingEmail } from "../lib/email.server";
import { REASONS } from "../lib/loss";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();

  const orderNameRaw = String(form.get("orderName") ?? "").trim();
  const reason = String(form.get("reason") ?? "other");
  const notes = String(form.get("notes") ?? "").trim();
  const raisedBy = String(form.get("raisedBy") ?? "").trim();

  if (!reason) return { error: "Please choose a reason." };

  // Optional: resolve the order to validate + store its GID and customer email.
  let orderName: string | null = orderNameRaw || null;
  let orderGid: string | null = null;
  let customerEmail: string | null = null;
  if (orderNameRaw) {
    try {
      const ord = await lookupOrderByName(admin, orderNameRaw);
      if (ord) { orderName = ord.name; orderGid = ord.gid; customerEmail = ord.email; }
    } catch (e) {
      // non-fatal: keep the typed name even if lookup fails
    }
  }

  const settings = await getSettings(shop);
  const publicToken = randomBytes(16).toString("hex");

  const created = await db.reprintRequest.create({
    data: {
      shop, orderName, orderGid, reason,
      notes: notes || null, raisedBy: raisedBy || null,
      publicToken, customerEmail,
    },
  });

  const storeHandle = shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE;
  const appUrl = appHandle
    ? `https://admin.shopify.com/store/${storeHandle}/apps/${appHandle}/app/${created.id}`
    : null;

  const ts = await postReprintAlert({
    channelId: settings.slackChannelId,
    orderName, reason, notes: notes || null, raisedBy: raisedBy || null, appUrl,
  });
  if (ts) await db.reprintRequest.update({ where: { id: created.id }, data: { slackTs: ts } });

  // Email the customer their tracking link (best-effort).
  if (customerEmail && process.env.SHOPIFY_APP_URL) {
    const trackUrl = `${process.env.SHOPIFY_APP_URL.replace(/\/$/, "")}/track/${publicToken}`;
    await sendTrackingEmail({ to: customerEmail, orderName, trackUrl });
  }

  return redirect(`/app/${created.id}`);
};

export default function NewReprint() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const submitting = nav.state === "submitting";
  const [orderName, setOrderName] = useState("");
  const [reason, setReason] = useState("misprint");
  const [notes, setNotes] = useState("");
  const [raisedBy, setRaisedBy] = useState("");

  const onSubmit = () => {
    const fd = new FormData();
    fd.set("orderName", orderName);
    fd.set("reason", reason);
    fd.set("notes", notes);
    fd.set("raisedBy", raisedBy);
    submit(fd, { method: "post" });
  };

  return (
    <Page title="Raise a reprint" backAction={{ content: "Reprints", url: "/app" }}>
      <Card>
        <BlockStack gap="300">
          {actionData?.error ? <Banner tone="critical" title={actionData.error} /> : null}
          <FormLayout>
            <TextField label="Order number" value={orderName} onChange={setOrderName}
              autoComplete="off" placeholder="#DTFN24609"
              helpText="Optional — links the original Shopify order for context." />
            <Select label="Reason" options={REASONS} value={reason} onChange={setReason} />
            <TextField label="Notes" value={notes} onChange={setNotes} autoComplete="off"
              multiline={3} placeholder="What went wrong?" />
            <TextField label="Your name" value={raisedBy} onChange={setRaisedBy}
              autoComplete="off" placeholder="e.g. Hannah" />
            <Text as="p" variant="bodySm" tone="subdued">
              Raising posts an alert to Slack #reprint-request so the team is notified.
            </Text>
            <Button variant="primary" loading={submitting} onClick={onSubmit}>Raise reprint</Button>
          </FormLayout>
        </BlockStack>
      </Card>
    </Page>
  );
}
