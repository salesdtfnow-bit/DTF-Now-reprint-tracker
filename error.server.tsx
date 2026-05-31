import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit, useActionData } from "@remix-run/react";
import { Page, Card, FormLayout, TextField, Button, BlockStack, Banner, Text } from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { getSettings, saveSettings } from "../lib/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { settings: await getSettings(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const num = (k: string) => parseFloat(String(form.get(k))) || 0;
  await saveSettings(session.shop, {
    filmPerM: num("filmPerM"),
    labourPerH: num("labourPerH"),
    machinePerH: num("machinePerH"),
    slackChannelId: String(form.get("slackChannelId") ?? "").trim() || "C0B7S8W09R6",
  });
  return { saved: true };
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();

  const [film, setFilm] = useState(String(settings.filmPerM));
  const [labour, setLabour] = useState(String(settings.labourPerH));
  const [machine, setMachine] = useState(String(settings.machinePerH));
  const [channel, setChannel] = useState(settings.slackChannelId);

  const save = () => {
    const fd = new FormData();
    fd.set("filmPerM", film); fd.set("labourPerH", labour);
    fd.set("machinePerH", machine); fd.set("slackChannelId", channel);
    submit(fd, { method: "post" });
  };

  return (
    <Page title="Settings">
      <Card>
        <BlockStack gap="300">
          {actionData?.saved ? <Banner tone="success" title="Settings saved" /> : null}
          <Text as="p" tone="subdued">Rates used to calculate true loss (material + labour + machine).</Text>
          <FormLayout>
            <TextField label="Film cost (£ per metre)" type="number" value={film} onChange={setFilm} autoComplete="off" min={0} step={0.01} />
            <TextField label="Labour rate (£ per hour)" type="number" value={labour} onChange={setLabour} autoComplete="off" min={0} step={0.01}
              helpText="Blended staff cost. DTF Now team blend ≈ £14.15/h." />
            <TextField label="Machine rate (£ per hour)" type="number" value={machine} onChange={setMachine} autoComplete="off" min={0} step={0.01} />
            <TextField label="Slack channel ID" value={channel} onChange={setChannel} autoComplete="off"
              helpText="Where new-reprint alerts are posted. #reprint-request = C0B7S8W09R6." />
            <Button variant="primary" loading={nav.state === "submitting"} onClick={save}>Save settings</Button>
          </FormLayout>
        </BlockStack>
      </Card>
    </Page>
  );
}
