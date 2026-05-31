import db from "../db.server";

// Returns the shop's rate settings, creating defaults on first use.
export async function getSettings(shop: string) {
  const existing = await db.settings.findUnique({ where: { shop } });
  if (existing) return existing;
  return db.settings.create({ data: { shop } });
}

export async function saveSettings(
  shop: string,
  data: {
    filmPerM: number;
    labourPerH: number;
    machinePerH: number;
    slackChannelId: string;
    processingMin: number;
    ripMinPerM: number;
    printSpeedMph: number;
    packMin: number;
  },
) {
  return db.settings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
}

const DEFAULT_EMPLOYEES = ["Hannah", "Ella", "Vitalijs", "Elisabeth"];

// Real carrier costs (ex-VAT) from DTF Now's DPD / Royal Mail invoices.
const DEFAULT_SHIPPING: { name: string; cost: number }[] = [
  { name: "No reship needed", cost: 0 },
  { name: "DPD Next Day Pre 10:30AM", cost: 17.68 },
  { name: "DPD Saturday Delivery", cost: 12.93 },
  { name: "DPD Next Day Pre 12PM", cost: 9.38 },
  { name: "DPD Standard Next Day Parcel", cost: 6.76 },
  { name: "DPD Standard Next Day Large Letter", cost: 5.46 },
  { name: "RM Tracked 24 Parcel (0.251-30kg)", cost: 4.45 },
  { name: "RM Tracked 24 Large Letter (0-0.25kg)", cost: 3.29 },
  { name: "RM Special Delivery (1-1.999kg)", cost: 12.23 },
  { name: "RM Special Delivery (0-0.999kg)", cost: 10.03 },
  { name: "RM Special Delivery (2-20kg)", cost: 22.68 },
];

// Seeds default employees + shipping rates once per shop.
export async function ensureSeeded(shop: string) {
  const settings = await getSettings(shop);
  if (settings.seeded) return;
  await db.employee.createMany({
    data: DEFAULT_EMPLOYEES.map((name) => ({ shop, name })),
  });
  await db.shippingRate.createMany({
    data: DEFAULT_SHIPPING.map((r, i) => ({
      shop,
      name: r.name,
      cost: r.cost,
      sortOrder: i,
    })),
  });
  await db.settings.update({ where: { shop }, data: { seeded: true } });
}
