# Going live — Supabase + Paystack + Vercel

This guide takes Rolling Pin from local dev to a live site that takes real orders
and payments.

## The one thing to understand first

The app is **two pieces**:

- **The frontend** — the React site customers see. It builds to static files, which
  is exactly what Vercel is built for.
- **The API** — `server/index.js`, an Express server that holds the Paystack
  **secret** key, talks to the database, and receives Paystack's webhook. This is a
  long-running process; Vercel's static hosting can't run it as-is.

So there are two ways to host it:

- **Option A (recommended, no code changes):** frontend on **Vercel**, the Express
  API on **Render** (built for always-on Node servers), data in **Supabase**.
- **Option B (one platform):** run the Express app as **Vercel Serverless
  Functions**. Needs two small files added to the repo, and Supabase becomes
  mandatory (serverless has no disk for `data.json` or local `/uploads`).

Steps 1 and 2 are identical either way. Option A is written out in full below;
Option B is sketched at the end.

> **Golden rule:** the Paystack secret key and the Supabase `service_role` key are
> **server-only**. They go in the API host's environment variables — never in the
> frontend, never committed to git. `.env` is gitignored; keep it that way.

---

## 1. Supabase (the shared database) — do this first

Everything else reads and writes through here, so set it up first.

1. Create a free project at **https://supabase.com** and wait for it to finish
   provisioning.
2. Open the project's **SQL Editor**, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the
   `orders`, `products`, `business`, and `settings` tables and enables row-level
   security with no public policies — so customer details are only ever reachable
   through our own server. Re-running the file is safe (every statement is
   idempotent).
3. Go to **Settings -> API** and copy two values:
   - **Project URL** -> use as `SUPABASE_URL`
   - **service_role** secret key (the secret one, **not** the `anon`/public key) ->
     use as `SUPABASE_SERVICE_ROLE_KEY`
4. These two values go in the **server's** environment (Render, step 3a). The
   `product-images` storage bucket for photos is created automatically on the first
   upload — no manual step.

> The `service_role` key bypasses all row-level security. It must live only on the
> server and must never be committed or placed in Vercel's frontend build.

---

## 2. Paystack (payments)

1. In the **Paystack dashboard -> Settings -> API Keys & Webhooks**, start in
   **Test Mode**. Copy the **Secret Key** (`sk_test_...`); this becomes
   `PAYSTACK_SECRET_KEY` on the server.
2. Set the **Webhook URL** to your API origin followed by `/api/paystack/webhook`:
   - Option A: `https://your-api.onrender.com/api/paystack/webhook`
   - Option B: `https://your-site.vercel.app/api/paystack/webhook`

   This is the safety net that confirms a payment server-to-server even if the
   customer closes the tab before the redirect. The server verifies its signature.
3. The **callback URL is automatic** — the frontend builds it from
   `window.location.origin + "/payment/callback"`, so it adapts to whatever domain
   you deploy to. Nothing to configure.
4. Test one full payment in test mode (see the end of this doc). When ready for real
   money, switch the dashboard to **Live Mode**, swap in the `sk_live_...` key, and
   set the live webhook URL. Going live requires the Paystack business account to be
   verified/approved.

---

## 3. Deploy (Option A: Vercel frontend + Render API)

### 3a. The API on Render

1. Push the repo to GitHub if it isn't already.
2. At **https://render.com** -> **New -> Web Service** -> connect the repo.
3. Configure:
   - **Build command:** `npm install`
   - **Start command:** `node server/index.js`
   - Render provides `PORT` automatically; the server already reads
     `process.env.PORT`.
4. Add these **Environment Variables** in Render:

   | Key | Value |
   | --- | --- |
   | `PAYSTACK_SECRET_KEY` | your `sk_test_...` (later `sk_live_...`) |
   | `SUPABASE_URL` | from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
   | `ADMIN_PASSWORD` | a private password for the `/admin` login |

5. Deploy, then open `https://your-api.onrender.com/api/health`. You want:

   ```json
   { "ok": true, "paystackConfigured": true, "storeMode": "supabase" }
   ```

> **Change `ADMIN_PASSWORD`** from the default `rollingpin` before going live.
> Changing it instantly logs everyone out of the admin dashboard.
>
> Render's free tier sleeps after ~15 minutes idle, so the first request after a
> nap is slow. For a real shop, the paid "always-on" tier (~$7/mo) is worth it.

### 3b. The frontend on Vercel

1. At **https://vercel.com** -> **Add New -> Project** -> import the same repo.
2. Vercel auto-detects Vite (Build command `npm run build`, Output directory
   `dist`). Leave the defaults.
3. Add **one** Environment Variable:

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://your-api.onrender.com` (your Render URL, no trailing slash) |

4. Deploy. The site is live at `your-site.vercel.app`.

> `VITE_API_URL` is baked into the build **at build time** — if you change it later,
> you must redeploy. Only put the API **URL** here, never a secret key.

The flow once both are up: Vercel serves the site -> the browser calls Render ->
Render talks to Supabase and Paystack. Cross-origin requests already work because
the server reflects the request origin in its CORS headers.

---

## Option B — everything on Vercel instead

Possible, but it needs a small code addition, not just configuration:

- a `vercel.json` that routes `/api/*` to a serverless function and serves the SPA
  for everything else, and
- an `api/` entry that exports the Express app (and guards `app.listen` so it
  doesn't run under serverless).

With that in place, steps 1, 2, and 3b apply, except:

- **Supabase is required** (serverless has no persistent disk for `data.json`; and
  product photos must use Supabase Storage, not local `/uploads` — which they do
  automatically in Supabase mode).
- `VITE_API_URL` stays **blank** (frontend and API share one origin).
- The Paystack webhook points at the Vercel domain.

Ask and these two files can be added for you — roughly a 10-minute change — after
which Option B is a single Vercel deploy.

---

## Suggested order of operations

1. Set up **Supabase** (step 1).
2. Point your **local** `.env` at Supabase + a Paystack **test** key and run one
   test order locally to confirm the whole chain works.
3. Deploy the **API** (Render) with the same env values.
4. Deploy the **frontend** (Vercel) with `VITE_API_URL`.
5. Place one **full test order** on the live test site — pick a cake, pay with a
   Paystack [test card](https://paystack.com/docs/payments/test-payments/), and
   confirm the order shows up in the `/admin` dashboard.
6. Switch Paystack to **Live Mode**, swap the secret key and webhook URL, and you're
   open for business.

## Environment variables at a glance

| Variable | Where it lives | Notes |
| --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | API host (Render) | Server only. Test key first, then live. |
| `SUPABASE_URL` | API host (Render) | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | API host (Render) | Server only — bypasses security. |
| `ADMIN_PASSWORD` | API host (Render) | The `/admin` login. Change from default. |
| `VITE_API_URL` | Frontend (Vercel) | The API's public URL. Blank for Option B. Build-time only. |

Leaving `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` blank makes the server fall
back to a local `server/data.json` file — fine for a single machine in dev, but not
for a deployed site.
