import { createCookieSessionStorage } from "@remix-run/node";

// Settings PIN gate. The PIN is set as the SETTINGS_PIN environment variable in
// Vercel and only ever checked on the server. Once entered correctly, an
// unlock flag is stored in a signed, http-only cookie that lasts for the
// browser session (SameSite=None+Secure so it works inside the Shopify iframe).
const storage = createCookieSessionStorage({
  cookie: {
    name: "__rt_settings_unlock",
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    secrets: [process.env.SHOPIFY_API_SECRET || "dev-fallback-secret"],
  },
});

export function pinConfigured(): boolean {
  return !!process.env.SETTINGS_PIN && process.env.SETTINGS_PIN.length > 0;
}

export function checkPin(pin: string): boolean {
  return pinConfigured() && pin === process.env.SETTINGS_PIN;
}

export async function isUnlocked(request: Request): Promise<boolean> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  return session.get("unlocked") === true;
}

// Returns a Set-Cookie header value to commit the unlocked session.
export async function commitUnlock(request: Request): Promise<string> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set("unlocked", true);
  return storage.commitSession(session);
}
