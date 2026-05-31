// Shared, framework-free helpers for the customer-facing tracking page.

export const PROGRESS_STAGES: { value: string; label: string }[] = [
  { value: "received", label: "Received" },
  { value: "reprinting", label: "Reprinting" },
  { value: "packed", label: "Packed" },
  { value: "dispatched", label: "Dispatched" },
];

export function progressIndex(value: string): number {
  const i = PROGRESS_STAGES.findIndex((s) => s.value === value);
  return i < 0 ? 0 : i;
}

export function progressLabel(value: string): string {
  return PROGRESS_STAGES.find((s) => s.value === value)?.label ?? value;
}

// Guess the carrier from the chosen shipping service name.
export function deriveCarrier(shippingService: string | null | undefined): string {
  const s = (shippingService ?? "").toLowerCase();
  if (s.includes("dpd")) return "dpd";
  if (s.includes("rm") || s.includes("royal")) return "royal_mail";
  return "other";
}

// Public tracking URL for a carrier + number (null if we can't build one).
export function carrierTrackUrl(carrier: string | null | undefined, num: string | null | undefined): string | null {
  if (!num) return null;
  const n = encodeURIComponent(num.trim());
  if (carrier === "dpd") return `https://track.dpd.co.uk/parcels/${n}`;
  if (carrier === "royal_mail") return `https://www.royalmail.com/track-your-item#/tracking-results/${n}`;
  return null;
}

export const carrierLabel = (c: string | null | undefined): string =>
  c === "dpd" ? "DPD" : c === "royal_mail" ? "Royal Mail" : "Carrier";
