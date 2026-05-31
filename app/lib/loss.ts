// True-loss calculation. DTF Now counts reprint cost only:
//   material  = lengthM * filmPerM
//   labour    = (minutes/60) * labourPerH
//   machine   = (minutes/60) * machinePerH
//   shipping  = real carrier cost of the reship (DPD/RM), if reshipped
// Linked Shopify order value is shown for context but NOT added to loss.

export type Rates = { filmPerM: number; labourPerH: number; machinePerH: number };

export type LossBreakdown = {
  material: number;
  labour: number;
  machine: number;
  shipping: number;
  total: number;
};

export function computeLoss(
  r: {
    status: string;
    lengthM: number | null;
    minutes: number | null;
    shippingCost?: number | null;
  },
  rates: Rates,
): LossBreakdown {
  if (r.status !== "done" || r.lengthM == null) {
    return { material: 0, labour: 0, machine: 0, shipping: 0, total: 0 };
  }
  const material = (r.lengthM ?? 0) * (rates.filmPerM ?? 0);
  const hrs = (r.minutes ?? 0) / 60;
  const labour = hrs * (rates.labourPerH ?? 0);
  const machine = hrs * (rates.machinePerH ?? 0);
  const shipping = r.shippingCost ?? 0;
  return {
    material,
    labour,
    machine,
    shipping,
    total: material + labour + machine + shipping,
  };
}

export const REASONS: { value: string; label: string }[] = [
  { value: "misprint", label: "Misprint" },
  { value: "colour", label: "Colour off" },
  { value: "damage", label: "Damaged" },
  { value: "customer_error", label: "Customer error" },
  { value: "other", label: "Other" },
];

export const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    Number.isFinite(n) ? n : 0,
  );
