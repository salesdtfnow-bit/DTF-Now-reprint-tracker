import db from "../db.server";

// Returns the shop's rate settings, creating defaults on first use.
export async function getSettings(shop: string) {
  const existing = await db.settings.findUnique({ where: { shop } });
  if (existing) return existing;
  return db.settings.create({ data: { shop } });
}

export async function saveSettings(
  shop: string,
  data: { filmPerM: number; labourPerH: number; machinePerH: number; slackChannelId: string },
) {
  return db.settings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
}
