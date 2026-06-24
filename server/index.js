// Payment + data server for Rolling Pin.
// The Paystack SECRET key lives here and ONLY here — never in the frontend.
// Orders, products, business details and settings live in a shared store
// (Supabase if configured, else a local JSON file) so the Kitchen dashboard and
// menu are live across every device.
//
// Public endpoints (storefront):
//   GET  /api/health                -> status / is the key configured / store mode
//   GET  /api/products              -> the menu
//   GET  /api/business              -> business details for the storefront
//   GET  /api/settings              -> { whatsappBackup, acceptingOrders }
//   GET  /api/orders/:code          -> one order by its RP-#### code (customer track)
//   POST /api/paystack/initialize   -> starts a transaction (amount locked server-side)
//   GET  /api/paystack/verify/:ref  -> confirms payment AND creates the order
//   POST /api/paystack/webhook      -> Paystack's signed server-to-server confirmation
// Admin endpoints (require a Bearer token from /api/admin/login):
//   POST   /api/admin/login         -> { password } -> { token }
//   GET    /api/admin/me            -> validate the current token
//   GET    /api/orders              -> all orders, newest first (customer PII)
//   PATCH  /api/orders/:id          -> { status } update
//   DELETE /api/orders/:id          -> remove an order
//   POST   /api/products            -> add a product
//   PATCH  /api/products/:id        -> edit a product
//   DELETE /api/products/:id        -> remove a product
//   PATCH  /api/business            -> edit business details
//   PATCH  /api/settings            -> update settings
//   POST   /api/uploads             -> { dataUrl } -> { url } (stores a product photo)

import express from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import {
  storeMode,
  STATUS_NEXT,
  listOrders,
  getOrderByCode,
  upsertPaidOrder,
  setStatus,
  deleteOrder,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getBusiness,
  setBusiness,
  getSettings,
  setSettings,
  uploadImage,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
} from './store.js'

const PORT = process.env.PORT || 3001
const SECRET = process.env.PAYSTACK_SECRET_KEY || ''
const PAYSTACK = 'https://api.paystack.co'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rollingpin'
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12 // admin stays signed in for 12 hours
const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads')

const app = express()

// Minimal CORS so the frontend can call the API if it ends up on another origin.
// In dev, Vite proxies /api to this server, so requests are same-origin anyway.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

/* --------------------------------- Auth ---------------------------------- *
 * A signed token = "<expiry>.<HMAC(expiry)>" using the admin password as the
 * key. It never contains the password, expires on its own, and is invalidated
 * automatically the moment the password changes. No DB/session needed.
 * ------------------------------------------------------------------------- */
function signExpiry(expiry) {
  return crypto.createHmac('sha256', ADMIN_PASSWORD).update(String(expiry)).digest('hex')
}
function makeToken() {
  const expiry = Date.now() + TOKEN_TTL_MS
  return `${expiry}.${signExpiry(expiry)}`
}
function tokenValid(token) {
  const [expStr, sig] = String(token || '').split('.')
  const expiry = Number(expStr)
  if (!sig || !Number.isFinite(expiry) || expiry < Date.now()) return false
  const expected = signExpiry(expiry)
  if (sig.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!tokenValid(token)) return res.status(401).json({ error: 'Please sign in to continue.' })
  next()
}

// Today's date as 'YYYY-MM-DD' in the server's local time. Used to reject orders
// placed for a date that has already passed.
function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* Basic in-memory throttle for the admin login, to blunt online password guessing.
 * Keyed by client IP; resets on success or after the window passes. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILS = 8
const loginFails = new Map() // ip -> { count, first }

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (fwd) return String(fwd).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}
function loginBlocked(ip) {
  const rec = loginFails.get(ip)
  if (!rec) return false
  if (Date.now() - rec.first > LOGIN_WINDOW_MS) {
    loginFails.delete(ip)
    return false
  }
  return rec.count >= LOGIN_MAX_FAILS
}
function noteLoginFailure(ip) {
  const rec = loginFails.get(ip)
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW_MS) loginFails.set(ip, { count: 1, first: Date.now() })
  else rec.count += 1
}

function ensureKey(res) {
  if (SECRET) return true
  res.status(503).json({
    error:
      'Payments are not switched on yet. Add PAYSTACK_SECRET_KEY to the server .env file and restart.',
  })
  return false
}

// Pull the fields we care about out of whatever the client sent, so we never
// store stray data and the order shape stays predictable.
function cleanDetails(raw = {}) {
  const c = raw.customer || {}
  return {
    productId: raw.productId,
    productName: raw.productName,
    emoji: raw.emoji,
    art: raw.art,
    weight: raw.weight,
    qty: Number(raw.qty),
    unitPrice: Number(raw.unitPrice),
    fulfillment: raw.fulfillment,
    date: raw.date,
    address: raw.address || '',
    deliveryZoneId: raw.deliveryZoneId || '',
    deliveryZone: raw.deliveryZone || '',
    deliveryFee: Number(raw.deliveryFee) || 0,
    customer: { name: c.name || '', phone: c.phone || '', email: c.email || '' },
    message: raw.message || '',
    total: Number(raw.total),
  }
}

// Turn a verified Paystack transaction into a saved order. Idempotent because the
// store upserts on payment_ref, so verify and the webhook can both run safely.
async function createOrderFromTransaction(d) {
  const details = d?.metadata?.order
  if (!details) return null
  return upsertPaidOrder(cleanDetails(details), {
    amountPaid: d.amount / 100, // Paystack subunit -> KES
    paymentRef: d.reference,
    paymentChannel: d.channel || null,
  })
}

// The webhook must read the RAW body to verify Paystack's signature, so it is
// mounted before the JSON parser.
app.post('/api/paystack/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  if (!SECRET) return res.sendStatus(503)
  const signature = req.headers['x-paystack-signature']
  const expected = crypto.createHmac('sha512', SECRET).update(req.body).digest('hex')
  if (expected !== signature) return res.sendStatus(401)

  let event
  try {
    event = JSON.parse(req.body.toString('utf8'))
  } catch {
    return res.sendStatus(400)
  }
  // Authoritative confirmation — create the order from Paystack's own copy of the
  // metadata. This is the safety net if the customer closes the tab before redirect.
  if (event.event === 'charge.success') {
    try {
      const order = await createOrderFromTransaction(event.data)
      if (order) console.log(`[paystack] charge.success ${event.data.reference} -> order ${order.code}`)
    } catch (e) {
      console.error(`[paystack] webhook could not save order: ${e.message}`)
    }
  }
  res.sendStatus(200)
})

// Allow large-ish JSON bodies because product photos arrive as base64 data URLs.
app.use(express.json({ limit: '12mb' }))

// Serve product photos saved to disk in file-store mode (Supabase mode returns
// full public URLs that don't hit this route).
app.use('/uploads', express.static(uploadsDir))

app.get('/api/health', (req, res) => {
  res.json({ ok: true, paystackConfigured: Boolean(SECRET), storeMode })
})

/* --------------------------------- Admin --------------------------------- */

app.post('/api/admin/login', (req, res) => {
  const ip = clientIp(req)
  if (loginBlocked(ip)) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.' })
  }
  const password = req.body?.password || ''
  // Constant-time compare so we don't leak the password length/prefix via timing.
  const a = Buffer.from(String(password))
  const b = Buffer.from(ADMIN_PASSWORD)
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
  if (!ok) {
    noteLoginFailure(ip)
    return res.status(401).json({ error: 'That password is not correct.' })
  }
  loginFails.delete(ip) // clear the slate on a successful sign-in
  res.json({ token: makeToken() })
})

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true })
})

/* -------------------------------- Payments ------------------------------- */

app.post('/api/paystack/initialize', async (req, res) => {
  if (!ensureKey(res)) return
  const { order, amountToPay, callbackUrl } = req.body || {}
  const details = cleanDetails(order)
  const email = details.customer.email

  if (!email) return res.status(400).json({ error: 'A customer email is required for the receipt.' })

  // Quantity must be a sensible whole number.
  const qty = Math.floor(Number(details.qty))
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
    return res.status(400).json({ error: 'Please choose a valid quantity.' })
  }

  // Don't accept an order for a date that has already passed.
  if (!details.date || !/^\d{4}-\d{2}-\d{2}$/.test(details.date) || details.date < todayLocal()) {
    return res.status(400).json({ error: 'Please choose a valid date in the future.' })
  }

  // Price the order from OUR menu, never from numbers the browser sent — otherwise a
  // crafted request could underpay. Look the product up and recompute the total.
  let product
  try {
    const products = await listProducts()
    product = products.find((p) => p.id === details.productId)
  } catch {
    return res.status(503).json({ error: 'Could not load the menu right now. Please try again.' })
  }
  if (!product) return res.status(400).json({ error: 'That cake is no longer on the menu.' })
  if (product.soldOut) return res.status(409).json({ error: `${product.name} is sold out right now.` })

  // Authoritative order details (overwrite anything the client claimed about price).
  details.qty = qty
  details.productName = product.name
  details.emoji = product.emoji
  details.art = product.art
  details.weight = product.weight
  details.unitPrice = Number(product.price) || 0
  const cake = details.unitPrice * qty
  if (!(cake > 0)) return res.status(400).json({ error: 'This order has no valid total.' })

  // Business details drive both the delivery fees and the deposit rate — read once.
  let business = {}
  try {
    business = await getBusiness()
  } catch {
    /* fall back to defaults below */
  }

  // Delivery fee is also authoritative: look the chosen area up in OUR own zone table
  // so a crafted request can't pick a cheaper fee (or skip it entirely).
  details.deliveryZone = ''
  details.deliveryFee = 0
  if (details.fulfillment === 'Delivery') {
    const zones = Array.isArray(business.deliveryZones) ? business.deliveryZones : []
    const zone = zones.find((z) => z.id === details.deliveryZoneId)
    if (!zone) return res.status(400).json({ error: 'Please choose your delivery area.' })
    details.deliveryFee = Number(zone.fee) || 0
    details.deliveryZone = `${zone.route} · ${zone.area}`
  }

  details.total = cake + details.deliveryFee
  const total = details.total

  // Don't take orders while the kitchen is paused.
  try {
    const settings = await getSettings()
    if (!settings.acceptingOrders) {
      return res.status(409).json({ error: 'Rolling Pin is not accepting new orders right now.' })
    }
  } catch {
    /* if settings can't be read, fall through and let the order proceed */
  }

  // Lock the payable amount server-side. The deposit is a share of the CAKE only —
  // delivery is paid on the day — so the floor is the cake deposit and the ceiling is
  // the full total (cake + delivery).
  const rate = Number(business.depositRate) || 0.5
  const cakeDeposit = Math.ceil(cake * rate)
  const amount = Math.min(total, Math.max(cakeDeposit, Number(amountToPay) || cakeDeposit))

  try {
    const r = await fetch(`${PAYSTACK}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100), // KES -> subunit
        currency: 'KES',
        metadata: { order: details },
        callback_url: callbackUrl,
      }),
    })
    const data = await r.json()
    if (!data.status) {
      return res.status(502).json({ error: data.message || 'Paystack could not start the payment.' })
    }
    res.json({
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    })
  } catch (e) {
    res.status(502).json({ error: `Could not reach Paystack: ${e.message}` })
  }
})

app.get('/api/paystack/verify/:reference', async (req, res) => {
  if (!ensureKey(res)) return
  try {
    const r = await fetch(
      `${PAYSTACK}/transaction/verify/${encodeURIComponent(req.params.reference)}`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
    )
    const data = await r.json()
    if (!data.status) {
      return res.status(502).json({ error: data.message || 'Could not verify the payment.' })
    }
    const d = data.data
    if (d.status !== 'success') {
      return res.json({ paid: false, status: d.status })
    }
    const order = await createOrderFromTransaction(d)
    if (!order) {
      return res.status(422).json({ error: 'Payment succeeded but the order details were missing.' })
    }
    res.json({ paid: true, status: d.status, order })
  } catch (e) {
    res.status(502).json({ error: `Could not verify the payment: ${e.message}` })
  }
})

/* -------------------------------- Products ------------------------------- */

app.get('/api/products', async (req, res) => {
  try {
    res.json(await listProducts())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    res.status(201).json(await createProduct(req.body || {}))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const product = await updateProduct(req.params.id, req.body || {})
    if (!product) return res.status(404).json({ error: 'Product not found.' })
    res.json(product)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    await deleteProduct(req.params.id)
    res.sendStatus(204)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/* -------------------------------- Business ------------------------------- */

app.get('/api/business', async (req, res) => {
  try {
    res.json(await getBusiness())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/business', requireAdmin, async (req, res) => {
  try {
    res.json(await setBusiness(req.body || {}))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/* ----------------------------- Delivery zones ---------------------------- */
// The list is read publicly via GET /api/business (deliveryZones). These edit it.

function cleanZoneInput(body = {}) {
  const area = String(body.area || '').trim()
  const route = String(body.route || '').trim()
  const fee = Number(body.fee)
  if (!area) return { error: 'Please enter the area name.' }
  if (!route) return { error: 'Please choose a route.' }
  if (!Number.isFinite(fee) || fee < 0) return { error: 'Please enter a delivery fee of 0 or more.' }
  return { value: { area, route, fee: Math.round(fee) } }
}

app.post('/api/delivery-zones', requireAdmin, async (req, res) => {
  const { error, value } = cleanZoneInput(req.body)
  if (error) return res.status(400).json({ error })
  try {
    res.status(201).json(await createDeliveryZone(value))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/delivery-zones/:id', requireAdmin, async (req, res) => {
  const { error, value } = cleanZoneInput(req.body)
  if (error) return res.status(400).json({ error })
  try {
    const zone = await updateDeliveryZone(req.params.id, value)
    if (!zone) return res.status(404).json({ error: 'That area was not found.' })
    res.json(zone)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/delivery-zones/:id', requireAdmin, async (req, res) => {
  try {
    await deleteDeliveryZone(req.params.id)
    res.sendStatus(204)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/* --------------------------------- Orders -------------------------------- */

// Protected: the full list carries customer names, phones and emails.
app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    res.json(await listOrders())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Public: a customer looks up their own order by its code on the Track page.
app.get('/api/orders/:code', async (req, res) => {
  try {
    const order = await getOrderByCode(req.params.code)
    if (!order) return res.status(404).json({ error: 'No order found for that code.' })
    res.json(order)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/orders/:id', requireAdmin, async (req, res) => {
  const status = req.body?.status
  if (!(status in STATUS_NEXT)) {
    return res.status(400).json({ error: `Unknown status "${status}".` })
  }
  try {
    const order = await setStatus(req.params.id, status)
    if (!order) return res.status(404).json({ error: 'Order not found.' })
    res.json(order)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    await deleteOrder(req.params.id)
    res.sendStatus(204)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/* -------------------------------- Settings ------------------------------- */

app.get('/api/settings', async (req, res) => {
  try {
    res.json(await getSettings())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/settings', requireAdmin, async (req, res) => {
  try {
    res.json(await setSettings(req.body || {}))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/* -------------------------------- Uploads -------------------------------- */

app.post('/api/uploads', requireAdmin, async (req, res) => {
  try {
    const { dataUrl } = req.body || {}
    if (!dataUrl) return res.status(400).json({ error: 'No image was provided.' })
    res.status(201).json(await uploadImage(dataUrl))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Start a long-lived listener only when run directly (local dev, or a normal Node
// host). On Vercel the app is imported by api/index.js and invoked per request, so
// there's no port to listen on — VERCEL is set in that environment.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Rolling Pin server listening on http://localhost:${PORT} (store: ${storeMode})`)
    if (!SECRET) console.log('  (PAYSTACK_SECRET_KEY not set — payments will return a 503 until you add it)')
    if (ADMIN_PASSWORD === 'rollingpin') {
      console.log('  (ADMIN_PASSWORD not set — using the default "rollingpin". Set it in .env before going live.)')
    }
  })
}

// Exported so a serverless function (api/index.js on Vercel) can hand requests to it.
export default app
