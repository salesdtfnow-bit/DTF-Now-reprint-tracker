import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit, useActionData } from "@remix-run/react";
import {
  Page, Card, FormLayout, TextField, Button, BlockStack, Banner, Text,
  InlineStack, Divider, InlineGrid,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { getSettings, saveSettings, ensureSeeded } from "../lib/settings.server";
import { listEmployees, addEmployee, removeEmployee } from "../lib/employees.server";
import { listShipping, addShipping, updateShipping, removeShipping } from "../lib/shipping.server";
import { isUnlocked, checkPin, commitUnlock, pinConfigured } from "../lib/pin.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  await ensureSeeded(shop);

  const configured = pinConfigured();
  const unlocked = await isUnlocked(request);

  // Locked: PIN is configured and not yet entered this session.
  if (configured && !unlocked) {
    return { locked: true, configured, settings: null, employees: [], shipping: [] };
  }

  const [settings, employees, shipping] = await Promise.all([
    getSettings(shop),
    listEmployees(shop),
    listShipping(shop),
  ]);
  return { locked: false, configured, settings, employees, shipping };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("_action") ?? "");

  // Unlock is the only action allowed while locked.
  if (intent === "unlock") {
    const pin = String(form.get("pin") ?? "");
    if (!checkPin(pin)) return { error: "Incorrect PIN." };
    const cookie = await commitUnlock(request);
    return redirect("/app/settings", { headers: { "Set-Cookie": cookie } });
  }

  // Guard every mutation behind the unlock (server-side).
  if (pinConfigured() && !(await isUnlocked(request))) {
    return { error: "Settings are locked. Enter the PIN first." };
  }

  const num = (k: string) => parseFloat(String(form.get(k))) || 0;

  if (intent === "saveRates") {
    await saveSettings(shop, {
      filmPerM: num("filmPerM"),
      labourPerH: num("labourPerH"),
      machinePerH: num("machinePerH"),
      slackChannelId: String(form.get("slackChannelId") ?? "").trim() || "C0B7S8W09R6",
    });
    return { saved: "rates" };
  }
  if (intent === "addEmployee") {
    await addEmployee(shop, String(form.get("name") ?? ""));
    return { saved: "employee" };
  }
  if (intent === "removeEmployee") {
    await removeEmployee(shop, String(form.get("id") ?? ""));
    return { saved: "employee" };
  }
  if (intent === "addShipping") {
    await addShipping(shop, String(form.get("name") ?? ""), num("cost"));
    return { saved: "shipping" };
  }
  if (intent === "updateShipping") {
    await updateShipping(shop, String(form.get("id") ?? ""), num("cost"));
    return { saved: "shipping" };
  }
  if (intent === "removeShipping") {
    await removeShipping(shop, String(form.get("id") ?? ""));
    return { saved: "shipping" };
  }
  return { error: "Unknown action." };
};

function PinGate() {
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const nav = useNavigation();
  const [pin, setPin] = useState("");

  const unlock = () => {
    const fd = new FormData();
    fd.set("_action", "unlock");
    fd.set("pin", pin);
    submit(fd, { method: "post" });
  };

  return (
    <Page title="Settings" backAction={{ content: "Reprints", url: "/app" }}>
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Enter PIN</Text>
          <Text as="p" tone="subdued">Settings are protected. Enter the PIN to change rates, employees, and shipping.</Text>
          {actionData?.error ? <Banner tone="critical" title={actionData.error} /> : null}
          <FormLayout>
            <TextField label="PIN" type="password" value={pin} onChange={setPin}
              autoComplete="off" inputMode="numeric" />
            <Button variant="primary" loading={nav.state === "submitting"} onClick={unlock}>Unlock</Button>
          </FormLayout>
        </BlockStack>
      </Card>
    </Page>
  );
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  if (data.locked) return <PinGate />;
  return <SettingsInner data={data} />;
}

function SettingsInner({ data }: { data: any }) {
  const { settings, employees, shipping, configured } = data;
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();

  const [film, setFilm] = useState(String(settings!.filmPerM));
  const [labour, setLabour] = useState(String(settings!.labourPerH));
  const [machine, setMachine] = useState(String(settings!.machinePerH));
  const [channel, setChannel] = useState(settings!.slackChannelId);
  const [newEmployee, setNewEmployee] = useState("");
  const [newShipName, setNewShipName] = useState("");
  const [newShipCost, setNewShipCost] = useState("");
  const [shipCosts, setShipCosts] = useState<Record<string, string>>(
    Object.fromEntries(shipping.map((s: any) => [s.id, String(s.cost)])),
  );

  const post = (fields: Record<string, string>) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    submit(fd, { method: "post" });
  };

  const saving = nav.state === "submitting";

  return (
    <Page title="Settings" backAction={{ content: "Reprints", url: "/app" }}>
      <BlockStack gap="400">
        {!configured ? (
          <Banner tone="warning" title="Settings PIN not set">
            <p>Add a <code>SETTINGS_PIN</code> environment variable in Vercel to lock this page.</p>
          </Banner>
        ) : null}
        {actionData?.saved ? <Banner tone="success" title="Saved" /> : null}
        {actionData?.error ? <Banner tone="critical" title={actionData.error} /> : null}

        {/* Rates */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Cost rates</Text>
            <Text as="p" tone="subdued">Used to calculate true loss (material + labour + machine + shipping).</Text>
            <FormLayout>
              <TextField label="Film cost (£ per metre)" type="number" value={film} onChange={setFilm} autoComplete="off" min={0} step={0.01} />
              <TextField label="Labour rate (£ per hour)" type="number" value={labour} onChange={setLabour} autoComplete="off" min={0} step={0.01}
                helpText="Blended staff cost. DTF Now team blend ≈ £14.15/h." />
              <TextField label="Machine rate (£ per hour)" type="number" value={machine} onChange={setMachine} autoComplete="off" min={0} step={0.01} />
              <TextField label="Slack channel ID" value={channel} onChange={setChannel} autoComplete="off"
                helpText="Where new-reprint alerts are posted. #reprint-request = C0B7S8W09R6." />
              <Button variant="primary" loading={saving} onClick={() => post({
                _action: "saveRates", filmPerM: film, labourPerH: labour, machinePerH: machine, slackChannelId: channel,
              })}>Save rates</Button>
            </FormLayout>
          </BlockStack>
        </Card>

        {/* Employees */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Employees</Text>
            <Text as="p" tone="subdued">These appear in the “Completed by” dropdown.</Text>
            <BlockStack gap="200">
              {employees.map((e: any) => (
                <div key={e.id}>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="span">{e.name}</Text>
                    <Button tone="critical" variant="plain" onClick={() => post({ _action: "removeEmployee", id: e.id })}>
                      Remove
                    </Button>
                  </InlineStack>
                  <Divider />
                </div>
              ))}
            </BlockStack>
            <InlineStack gap="200" blockAlign="end">
              <div style={{ flex: 1 }}>
                <TextField label="Add employee" labelHidden value={newEmployee} onChange={setNewEmployee}
                  autoComplete="off" placeholder="New employee name" />
              </div>
              <Button onClick={() => { if (newEmployee.trim()) { post({ _action: "addEmployee", name: newEmployee }); setNewEmployee(""); } }}>
                Add
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Shipping rates */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Shipping rates</Text>
            <Text as="p" tone="subdued">Real carrier cost (ex-VAT) added to loss when a reprint is reshipped.</Text>
            <BlockStack gap="200">
              {shipping.map((s: any) => (
                <div key={s.id}>
                  <InlineGrid columns={{ xs: 1, sm: 3 }} gap="200" alignItems="end">
                    <Text as="span">{s.name}</Text>
                    <TextField label="Cost £" labelHidden type="number" min={0} step={0.01}
                      value={shipCosts[s.id] ?? ""} autoComplete="off"
                      onChange={(v) => setShipCosts({ ...shipCosts, [s.id]: v })} prefix="£" />
                    <InlineStack gap="200">
                      <Button onClick={() => post({ _action: "updateShipping", id: s.id, cost: shipCosts[s.id] ?? "0" })}>Save</Button>
                      <Button tone="critical" variant="plain" onClick={() => post({ _action: "removeShipping", id: s.id })}>Remove</Button>
                    </InlineStack>
                  </InlineGrid>
                  <Divider />
                </div>
              ))}
            </BlockStack>
            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="200" alignItems="end">
              <TextField label="New shipping option" value={newShipName} onChange={setNewShipName} autoComplete="off" placeholder="e.g. DPD Next Day" />
              <TextField label="Cost £" type="number" min={0} step={0.01} value={newShipCost} onChange={setNewShipCost} autoComplete="off" prefix="£" />
              <Button onClick={() => { if (newShipName.trim()) { post({ _action: "addShipping", name: newShipName, cost: newShipCost || "0" }); setNewShipName(""); setNewShipCost(""); } }}>
                Add shipping option
              </Button>
            </InlineGrid>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
