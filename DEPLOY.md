# Going live — Vercel + Supabase

This takes Rolling Pin from local dev to a live site that takes real orders and
payments, on **two services only: Vercel (hosting) and Supabase (database)**.

## How it fits together

Everything runs on **one Vercel project**:

- **The site** — the React app. Vite builds it to static files, which Vercel serves.
- **The API** — `server/index.js` (Express). On Vercel it runs as a **serverless
  function** through `api/index.js`; every `/api/*` request is handed to the same
  Express app. No separate server to run or pay for.
- **The data** — orders, products, business details, settings **and** product photos
  live in **Supabase**. This is required on Vercel: serverless has no disk of its own,
  so the local-file fallback can't be used in production.

Because the site and API share one domain, there's **no API URL to configure and no
CORS to worry about** — the browser just calls `/api/...` on the same origin.

The two files that make this work — `vercel.json` and `api/index.js` — are already in
the repo, so Vercel picks them up automatically.

> **Golden rule:** the Paystack secret key and the Supabase `service_role` key are
> **server-only**. They go in Vercel's Environment Variables — never in the frontend,
> never committed to git. `.env` is gitignored; keep it that way.

---

## 1. Supabase (the database) — do this first

Everything reads and writes through here, so set it up first.

1. Create a free project at **https://supabase.com** and wait for it to finish
   provisioning.
2. Open the project's **SQL Editor**, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the
   `orders`, `products`, `business`, and `settings` tables and turns on row-level
   security with no public policies — so customer details are only ever reachable
   through our own server. Re-running the file is safe (every statement is idempotent).
3. Go to **Settings → API** and copy two values:
   - **Project URL** → use as `SUPABASE_URL`
   - **service_role** secret key (the secret one, **not** the `anon`/public key) →
     use as `SUPABASE_SERVICE_ROLE_KEY`
4. The `product-images` storage bucket for photos is created automatically on the
   first upload — no manual step. (Delivery areas need no setup either: they seed
   themselves and are edited later from **Admin → Delivery**.)

> The `service_role` key bypasses all row-level security. It must live only on the
> server (Vercel env vars) and must never be committed or shipped to the browser.

---

## 2. Paystack (payments)

1. In the **Paystack dashboard → Settings → API Keys & Webhooks**, start in
   **Test Mode**. Copy the **Secret Key** (`sk_test_...`); this becomes
   `PAYSTACK_SECRET_KEY`.
2. Set the **Webhook URL** to your Vercel domain followed by `/api/paystack/webhook`,
   e.g. `https://your-site.vercel.app/api/paystack/webhook`. (You'll know the exact
   domain after step 3 — you can come back and set this.) It confirms a payment
   server-to-server even if the customer closes the tab; the server checks its
   signature.
3. The **callback URL is automatic** — the app builds it from the current domain, so
   there's nothing to configure.
4. When you're ready for real money, switch the dashboard to **Live Mode**, swap in
   the `sk_live_...` key, and update the webhook URL. Going live needs your Paystack
   business account to be verified/approved.

---

## 3. Deploy to Vercel

1. Push the repo to GitHub (or GitLab/Bitbucket) if it isn't already.
2. At **https://vercel.com** → **Add New → Project** → import the repo. Vercel detects
   Vite automatically and reads `vercel.json` — leave the build settings as they are.
3. Before deploying, open **Environment Variables** and add these four:

   | Key | Value |
   | --- | --- |
   | `PAYSTACK_SECRET_KEY` | your `sk_test_...` (later `sk_live_...`) |
   | `SUPABASE_URL` | from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
   | `ADMIN_PASSWORD` | a private password for the `/admin` login |

   **Do not set `VITE_API_URL`** — leaving it blank makes the site call the API on its
   own domain, which is exactly what you want here.

4. Click **Deploy**. When it finishes, open `https://your-site.vercel.app/api/health`.
   You want:

   ```json
   { "ok": true, "paystackConfigured": true, "storeMode": "supabase" }
   ```

   If `storeMode` says `file` or the page errors, the Supabase variables aren't set
   correctly — fix them and redeploy.

> **Change `ADMIN_PASSWORD`** from the default `rollingpin` before sharing the site.
> Changing it later instantly signs everyone out of the admin dashboard.
>
> Environment-variable changes only take effect on the **next deploy** — hit
> **Redeploy** in Vercel after editing them.

---

## 4. Test the whole chain

1. Open the live site, place a real order, and pay with a Paystack
   [test card](https://paystack.com/docs/payments/test-payments/) (or test M-Pesa).
2. Confirm you land on the confirmation page and that the order shows up in
   **`/admin` → Orders**.
3. Try a **delivery** order: pick an area, check the fee lands in the total, and that
   the area + fee show on the order in the dashboard.

When that works in test mode, switch Paystack to **Live Mode**, swap the secret key
and webhook URL in Vercel + Paystack, redeploy, and you're open for business.

---

## Environment variables at a glance

| Variable | Where | Notes |
| --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | Vercel | Server-only. Test key first, then live. |
| `SUPABASE_URL` | Vercel | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Server-only — bypasses row-level security. |
| `ADMIN_PASSWORD` | Vercel | The `/admin` login. Change from the default. |
| `VITE_API_URL` | — | **Leave unset.** Frontend and API share one domain. |

---

## Good to know

- **Local dev is unchanged.** Two terminals: `npm run server` (API on :3001) and
  `npm run dev` (site on :5173, which proxies `/api` to the server). Point your local
  `.env` at Supabase + a Paystack **test** key to mirror production, or leave Supabase
  out locally to use the simple `server/data.json` file store (dev only).
- **Order creation is robust.** When a customer returns from Paystack, the site calls
  `/api/paystack/verify` and the order is created there; the webhook is a second,
  independent safety net. So orders are created even if a customer closes the tab.
  After your first live test, just confirm the order appeared — that proves the chain.
- **Admin brute-force throttle** (the 8-tries lockout) is held in memory, so on
  serverless it's best-effort per function instance rather than global. The signed
  12-hour token and constant-time password check are unaffected. For a small shop this
  is fine; if you ever want a hard global limit, it can be moved into Supabase later.
