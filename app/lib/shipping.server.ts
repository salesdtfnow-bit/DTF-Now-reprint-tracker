import db from "../db.server";

export async function listShipping(shop: string) {
  return db.shippingRate.findMany({
    where: { shop, active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function addShipping(shop: string, name: string, cost: number) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const count = await db.shippingRate.count({ where: { shop } });
  return db.shippingRate.create({
    data: { shop, name: trimmed, cost: cost || 0, sortOrder: count },
  });
}

export async function updateShipping(
  shop: string,
  id: string,
  cost: number,
) {
  return db.shippingRate.updateMany({
    where: { id, shop },
    data: { cost: cost || 0 },
  });
}

export async function removeShipping(shop: string, id: string) {
  return db.shippingRate.updateMany({
    where: { id, shop },
    data: { active: false },
  });
}
