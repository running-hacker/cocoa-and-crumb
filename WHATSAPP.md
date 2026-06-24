# WhatsApp order notifications

When an order is paid for, Rolling Pin can automatically send:

- the **customer** a confirmation with their order number, and
- **you (the kitchen)** a "new order" alert.

It uses Meta's official **WhatsApp Cloud API**. The code is already wired in
(`server/notify.js`); this guide is the one-time Meta setup + the environment variables
to switch it on. Until it's configured, the app runs normally and just skips sending.

> **Heads-up on timing:** because these messages start a conversation (rather than reply
> within 24h), Meta requires **pre-approved message templates**. Order confirmations are
> the "**Utility**" category, which is the easiest to get approved (usually minutes to a
> few hours). Budget a little lead time before your launch for this.

---

## 1. Create the WhatsApp app

1. You need a **Meta Business account** (https://business.facebook.com). Create one if
   the business doesn't have it.
2. Go to **https://developers.facebook.com → My Apps → Create App → Business**.
3. On the app, **Add product → WhatsApp → Set up**.
4. The **API Setup** screen now shows a test sender number and a temporary token —
   enough to try things, but you'll want a permanent setup for going live (below).

## 2. Get the two credentials the code needs

- **`WHATSAPP_PHONE_NUMBER_ID`** — on the **API Setup** screen, under *From*, each number
  has a **Phone number ID** (a long number). Copy it. (This is the ID, **not** the phone
  number itself.)
- **`WHATSAPP_TOKEN`** — the temporary token on that screen lasts 24h (fine for a first
  test). For production, make a **permanent** one:
  **Business Settings → Users → System Users → Add** (Admin) → **Assign assets** → add
  your WhatsApp app → **Generate token** with the `whatsapp_business_messaging` and
  `whatsapp_business_management` permissions. Save that token somewhere safe — it's shown
  once.

> For real customers (not just test recipients) you must **add and verify your own
> business phone number** in the WhatsApp product, then use *its* Phone number ID. The
> free test number can only message a handful of numbers you pre-register.

## 3. Create the two message templates

In **WhatsApp Manager → Manage templates → Create template**, category **Utility**,
language **English** (`en`). Create both, **exactly** as below (the variables are
positional — the order matters):

### Template 1 — name: `order_confirmation` (to the customer)

```
Hi {{1}}! 🧁 Your Rolling Pin order {{2}} is confirmed. {{3}} · {{4}} on {{5}}. Total {{6}}, paid {{7}}, balance {{8}} on the day. We'll be in touch shortly — asante! 💛
```

Sample values to give Meta: `Jane`, `RP-1234`, `2 × Marble Cake (800g)`, `Delivery`,
`2026-07-15`, `KSH 2,500`, `KSH 500`, `KSH 2,000`.

### Template 2 — name: `new_order` (to you/the kitchen)

```
New order {{1}} 🎂 {{2}}. Customer {{3}} ({{4}}). {{5}} on {{6}}. Balance to collect: {{7}}. Open the Kitchen dashboard for full details.
```

Sample values: `RP-1234`, `2 × Marble Cake (800g)`, `Jane Doe`, `0797 528 174`,
`Delivery — Ngong Road · Kilimani`, `2026-07-15`, `KSH 2,000`.

> If you rename a template or change its language, set `WHATSAPP_TEMPLATE_CUSTOMER`,
> `WHATSAPP_TEMPLATE_OWNER`, or `WHATSAPP_LANG` to match (see below). The number and order
> of the `{{n}}` variables must stay the same, or update `server/notify.js` to match.

## 4. Set the environment variables

Locally in `server/.env`, or in the **Vercel project → Settings → Environment Variables**
(then redeploy):

| Variable | Required | Notes |
| --- | --- | --- |
| `WHATSAPP_TOKEN` | yes | The (permanent) access token from step 2. |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | The sender's Phone number ID from step 2. |
| `OWNER_WHATSAPP` | no | Where the "new order" alert goes. Defaults to the business WhatsApp number (`254797528174`). International format, no `+`. |
| `WHATSAPP_LANG` | no | Template language code. Default `en`. |
| `WHATSAPP_TEMPLATE_CUSTOMER` | no | Default `order_confirmation`. |
| `WHATSAPP_TEMPLATE_OWNER` | no | Default `new_order`. |
| `WHATSAPP_API_VERSION` | no | Default `v21.0`. |
| `WHATSAPP_DRY_RUN` | no | Set to `1` to log what *would* be sent without calling Meta — handy for testing. |

## 5. Test it

1. **Dry run, no Meta needed:** set `WHATSAPP_DRY_RUN=1`, restart the server, place a test
   order. The server logs two lines showing the recipient, template, and parameters — so
   you can confirm the wiring and the message contents.
2. **Live, with credentials:** unset `WHATSAPP_DRY_RUN`, add `WHATSAPP_TOKEN` +
   `WHATSAPP_PHONE_NUMBER_ID`, and place a real test order. The customer number and your
   `OWNER_WHATSAPP` should both receive the message.

## Good to know

- **Cost:** Meta gives a monthly free allotment of conversations; beyond that, Utility
  conversations are billed per conversation at Kenya's rate. For a small shop this is tiny.
- **Phone format is handled for you:** customer numbers like `0797 528 174` are converted
  to `254797528174` automatically (`toIntlKE` in `server/notify.js`).
- **It never blocks an order:** if WhatsApp is down, misconfigured, or a number is invalid,
  the order is still created and the failure is just logged. The on-screen confirmation and
  the `/admin` dashboard are unaffected.
