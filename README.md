# DTF Now — Reprint Tracker (Shopify embedded app)

An embedded Shopify admin app where staff raise reprints, action them, and see
true loss — and every new reprint auto-posts an alert to Slack **#reprint-request**.

- Raise a reprint (order, reason, notes) → recorded in the app's database **and** posted to Slack for staff attention.
- Staff open the request in-app and complete it (reprint length, time, reprinted or written off).
- **True loss** = material (film £/m) + labour + machine time. Linked Shopify order shown for context only.
- Reports: loss by reason and by staff; running totals.
- Rates editable in Settings (defaults: film £2.50/m, labour £14.15/h, machine £8/h).

> **Honest note:** this is complete, idiomatic code built on Shopify's official
> Remix app template. It has **not** been run end-to-end here (that needs your
> Shopify Partner app, a database, and Slack credentials). Hand this to a
> developer for the ~half-day deploy below, or follow it yourself if comfortable
> with a terminal. The custom logic (reprints, Slack, loss, orders) is in
> `app/lib/*` and `app/routes/app.*` and is the part worth reviewing.

---

## What you need first

1. **Shopify Partner account** (free) — partners.shopify.com — to create the app.
2. **Node.js 20+** and the **Shopify CLI** (`npm i -g @shopify/cli@latest`).
3. **A Postgres database** for production (Vercel Postgres or Neon — both have free tiers). Vercel can't use SQLite because its filesystem is temporary.
4. **A Slack app** with a bot token (steps below).
5. Your **Vercel account** (already connected) for hosting.

---

## Step 1 — Scaffold the official template

This generates the correct, current OAuth/session/deploy boilerplate.

```bash
npm init @shopify/app@latest -- --template remix
# choose: TypeScript, and your Partner org / app name
cd <the-folder-it-created>
```

## Step 2 — Drop in the Reprint Tracker files

Copy the contents of this package **over** the scaffolded project (keep the
template's files; add/overwrite these):

- `prisma/schema.prisma` — **merge**: keep the template's `Session` model, add `ReprintRequest` + `Settings` (both already in this file).
- `app/db.server.ts` — same as the template (included for reference).
- `app/lib/loss.ts`, `app/lib/settings.server.ts`, `app/lib/slack.server.ts`, `app/lib/orders.server.ts`
- `app/routes/app.tsx`, `app/routes/app._index.tsx`, `app/routes/app.new.tsx`, `app/routes/app.$id.tsx`, `app/routes/app.reports.tsx`, `app/routes/app.settings.tsx`
- `shopify.app.toml` — set `scopes = "read_orders"` and your store URL.
- `vite.config.ts` — adds the Vercel preset.

Then:

```bash
npm install
npm install @vercel/remix          # for Vercel deploys (see package.notes.json)
```

## Step 3 — Create the Slack app + bot token

1. Go to api.slack.com/apps → **Create New App** → From scratch → pick the *decalslabltd* workspace.
2. **OAuth & Permissions** → Bot Token Scopes → add **`chat:write`**.
3. **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-…`).
4. In Slack, open **#reprint-request** → `/invite @YourAppName` so the bot can post.
5. That token goes in `SLACK_BOT_TOKEN` (Step 5). The channel ID `C0B7S8W09R6` is already the default in Settings.

## Step 4 — Database

For production, switch Prisma to Postgres:

- In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
- Create the DB: in Vercel → Storage → create a **Postgres** (or use Neon) → copy its connection string into `DATABASE_URL`.
- Apply the schema:

```bash
npx prisma migrate deploy        # or: npx prisma db push
npx prisma generate
```

(For local testing first, leave it on SQLite with `DATABASE_URL="file:dev.sqlite"` and run `npm run dev`.)

## Step 5 — Deploy to Vercel

1. Push the project to a GitHub repo.
2. In Vercel → **Add New Project** → import that repo → framework preset **Remix**.
3. Add Environment Variables (from `.env.example`):
   `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` (your `https://<project>.vercel.app`), `SCOPES=read_orders`, `SHOPIFY_APP_HANDLE`, `DATABASE_URL`, `SLACK_BOT_TOKEN`.
4. Deploy. Note the live URL.

## Step 6 — Point Shopify at the deployed URL and install

```bash
shopify app config link          # links this code to your Partner app
# set application_url + redirect URLs to your Vercel URL (also in shopify.app.toml)
shopify app deploy               # pushes config/scopes to Shopify
```

Then install the app on **dtfnow.myshopify.com** from your Partner dashboard
(Apps → your app → Select store). It opens inside Shopify admin under Apps.

---

## How staff use it

- **Apps → DTF Now Reprint Tracker** in Shopify admin.
- **Raise reprint**: fill order/reason/notes + name → Slack #reprint-request gets the alert instantly.
- Click any pending row → enter length, time, reprinted/written-off → **Save**. The thread in Slack is updated too.
- **Reports** tab shows true loss by reason and by staff.
- **Settings** tab: set film/labour/machine rates and the Slack channel.

## File map

```
prisma/schema.prisma         data model (ReprintRequest, Settings, Session)
app/db.server.ts             Prisma client
app/lib/loss.ts              true-loss maths + reason list (shared, pure)
app/lib/settings.server.ts   per-shop rate settings
app/lib/slack.server.ts      posts alerts + completion replies to Slack
app/lib/orders.server.ts     Shopify order lookup by name (Admin GraphQL)
app/routes/app.tsx           embedded layout + nav
app/routes/app._index.tsx    list + KPI tiles + filter
app/routes/app.new.tsx       raise reprint (writes DB + Slack alert)
app/routes/app.$id.tsx       detail + complete action
app/routes/app.reports.tsx   loss reports
app/routes/app.settings.tsx  rates + channel
```

## Things to confirm during deploy

- `authenticate.admin(request)` and `../shopify.server` come from the template — the import path is correct if you scaffolded as in Step 1.
- The Slack bot must be **invited to the channel** or posts silently fail (handled gracefully — the app still records).
- `read_orders` scope must be approved at install for order lookup to work.
