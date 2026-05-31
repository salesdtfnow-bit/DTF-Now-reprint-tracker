import db from "../db.server";

export async function listEmployees(shop: string) {
  return db.employee.findMany({
    where: { shop, active: true },
    orderBy: { name: "asc" },
  });
}

export async function addEmployee(shop: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return db.employee.create({ data: { shop, name: trimmed } });
}

// Soft-delete so historical "completed by" values still make sense.
export async function removeEmployee(shop: string, id: string) {
  return db.employee.updateMany({
    where: { id, shop },
    data: { active: false },
  });
}
