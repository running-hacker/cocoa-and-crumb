// Storage abstraction for orders, products, business details, settings + images.
// If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, data is shared live across
// every device via Supabase. Otherwise it falls back to a local JSON file (+ an
// uploads folder) so the app still runs on one machine.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const useSupabase = Boolean(URL && SERVICE_KEY)

export const storeMode = useSupabase ? 'supabase' : 'file'

// A serverless host (Vercel) has no writable disk, so the local file store can't work
// there — Supabase is required. Fail loudly with a clear message instead of a cryptic
// read-only-filesystem error on the first write.
if (process.env.VERCEL && !useSupabase) {
  throw new Error(
    'Supabase is required on Vercel. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel project environment variables.',
  )
}

const STATUS_FLOW = { New: 'Baking', Baking: 'Ready', Ready: 'Completed', Completed: null }
const IMAGE_BUCKET = 'product-images'

function genCode() {
  return `RP-${Math.floor(1000 + Math.random() * 9000)}`
}

/* ------------------------------------------------------------------ *
 * Seeds — the starting menu + business details. Used the first time the
 * store is empty so nothing is lost when products move off the static file.
 * ------------------------------------------------------------------ */
const PRODUCTS_SEED = [
  { id: 'marble-cake', name: 'Marble Cake', category: 'Cakes', emoji: '🍰', tag: 'Bestseller', blurb: 'Buttery vanilla & cocoa swirled into one stunning loaf.', art: 'linear-gradient(135deg, #e8d5c0 0%, #6f4e37 48%, #ead7c2 100%)', price: 1000, image: null, weight: '800g', soldOut: false, sort: 0 },
  { id: 'choc-chip-banana', name: 'Choc Chip Banana Bread', category: 'Banana Bread', emoji: '🍌', tag: 'Loaded', blurb: 'Banana loaf loaded with melty chocolate chips.', art: 'linear-gradient(160deg, #e0c08a, #7a5230)', price: 1000, image: null, weight: '800g', soldOut: false, sort: 1 },
  { id: 'plain-banana', name: 'Plain Banana Bread', category: 'Banana Bread', emoji: '🍞', tag: null, blurb: 'Classic, moist banana loaf.', art: 'linear-gradient(160deg, #ecd9a8, #c8a25c)', price: 800, image: null, weight: '800g', soldOut: false, sort: 2 },
  { id: 'lemon-cake', name: 'Lemon Cake', category: 'Cakes', emoji: '🍋', tag: 'Zesty', blurb: 'Zesty lemon loaf with a sweet lemon glaze.', art: 'linear-gradient(160deg, #f0e2a0, #cda958)', price: 800, image: null, weight: '800g', soldOut: false, sort: 3 },
  { id: 'decadent-chocolate', name: 'Decadent Chocolate Cake', category: 'Cakes', emoji: '🍫', tag: 'Rich', blurb: 'Deep rich chocolate cake topped with glossy ganache.', art: 'linear-gradient(160deg, #6b4a34, #3a2418)', price: 1000, image: null, weight: '800g', soldOut: false, sort: 4 },
  { id: 'vanilla-pound', name: 'Vanilla Pound Cake', category: 'Cakes', emoji: '🎂', tag: 'Classic', blurb: 'Golden classic that pairs beautifully with tea or coffee.', art: 'linear-gradient(160deg, #ecdcc2, #c9a376)', price: 800, image: null, weight: '800g', soldOut: false, sort: 5 },
]

// Delivery fee schedule by area, grouped by the main road out of town. Fees are in
// KES and are added to the order total at checkout (collected on delivery). Lives in
// the business record so it ships to the storefront and can be edited later.
const DELIVERY_ZONES_SEED = [
  { id: 'ng1', route: 'Ngong Road', area: 'Ngong Town', fee: 200 },
  { id: 'ng2', route: 'Ngong Road', area: 'Ngong Vet', fee: 150 },
  { id: 'ng3', route: 'Ngong Road', area: 'Kibiko', fee: 250 },
  { id: 'ng4', route: 'Ngong Road', area: 'Bondeni', fee: 200 },
  { id: 'ng5', route: 'Ngong Road', area: 'Kimuka', fee: 300 },
  { id: 'ng6', route: 'Ngong Road', area: 'Ololua', fee: 250 },
  { id: 'ng7', route: 'Ngong Road', area: 'Kerarapon', fee: 250 },
  { id: 'ng8', route: 'Ngong Road', area: 'Karen (Miotoni, Bogani, Hardy)', fee: 300 },
  { id: 'ng9', route: 'Ngong Road', area: 'Ngando', fee: 400 },
  { id: 'ng10', route: 'Ngong Road', area: 'Lenana / Racecourse', fee: 400 },
  { id: 'ng11', route: 'Ngong Road', area: 'Santack', fee: 400 },
  { id: 'ng12', route: 'Ngong Road', area: 'Dagoretti Corner', fee: 450 },
  { id: 'ng13', route: 'Ngong Road', area: 'Adams Arcade / Woodley', fee: 450 },
  { id: 'ng14', route: 'Ngong Road', area: 'Riara Road / Junction Mall', fee: 450 },
  { id: 'ng15', route: 'Ngong Road', area: 'Kilimani', fee: 500 },
  { id: 'ng16', route: 'Ngong Road', area: 'Milimani', fee: 500 },
  { id: 'ng17', route: 'Ngong Road', area: 'Upper Hill', fee: 600 },
  { id: 'ww1', route: 'Waiyaki Way', area: 'Kikuyu Town', fee: 300 },
  { id: 'ww2', route: 'Waiyaki Way', area: 'Zambezi / Sigona / Regen', fee: 400 },
  { id: 'ww3', route: 'Waiyaki Way', area: 'Muthiga / Kinoo / 87', fee: 400 },
  { id: 'ww4', route: 'Waiyaki Way', area: 'Uthiru / Cooperation', fee: 400 },
  { id: 'ww5', route: 'Waiyaki Way', area: 'Mountain View', fee: 400 },
  { id: 'ww6', route: 'Waiyaki Way', area: 'Loresho', fee: 450 },
  { id: 'ww7', route: 'Waiyaki Way', area: 'Kangemi', fee: 400 },
  { id: 'ww8', route: 'Waiyaki Way', area: 'ABC Place / James Gichuru', fee: 400 },
  { id: 'ww9', route: 'Waiyaki Way', area: 'Kianda / Safaricom / Deloitte', fee: 450 },
  { id: 'ww10', route: 'Waiyaki Way', area: 'Muthangari', fee: 450 },
  { id: 'ww11', route: 'Waiyaki Way', area: 'Westlands (CBD, Rhapta Rd, Muthithi Rd)', fee: 450 },
  { id: 'ww12', route: 'Waiyaki Way', area: 'Brookside / School Lane', fee: 500 },
  { id: 'lr1', route: 'Limuru Road', area: 'Parklands (1st - 6th Avenue)', fee: 600 },
  { id: 'lr2', route: 'Limuru Road', area: 'City Park / Muthaiga', fee: 650 },
  { id: 'lr3', route: 'Limuru Road', area: 'Gigiri / UN Complex', fee: 650 },
  { id: 'lr4', route: 'Limuru Road', area: 'Warwick Centre / Village Market', fee: 650 },
  { id: 'lr5', route: 'Limuru Road', area: 'Runda (Old & New)', fee: 700 },
  { id: 'lr6', route: 'Limuru Road', area: 'Rosslyn (Lone Tree, Riviera)', fee: 700 },
  { id: 'lr7', route: 'Limuru Road', area: 'Nyari Estate', fee: 650 },
  { id: 'lr8', route: 'Limuru Road', area: 'Ruaka / Joyland', fee: 600 },
  { id: 'lr9', route: 'Limuru Road', area: 'Muchatha / Banana / Raini', fee: 700 },
  { id: 'lr10', route: 'Limuru Road', area: 'Tigoni / Limuru Town', fee: 850 },
  { id: 'kr1', route: 'Kiambu Road', area: 'Karura / Windsor', fee: 700 },
  { id: 'kr2', route: 'Kiambu Road', area: 'Muthaiga North', fee: 700 },
  { id: 'kr3', route: 'Kiambu Road', area: 'Ridgeways / Ridgeways Mall', fee: 700 },
  { id: 'kr4', route: 'Kiambu Road', area: 'Garden Estate', fee: 700 },
  { id: 'kr5', route: 'Kiambu Road', area: 'Northern Bypass Junction', fee: 750 },
  { id: 'kr6', route: 'Kiambu Road', area: 'Thindigua', fee: 750 },
  { id: 'kr7', route: 'Kiambu Road', area: 'Kasarini / Ineza', fee: 750 },
  { id: 'kr8', route: 'Kiambu Road', area: 'Mushroom Gardens', fee: 800 },
  { id: 'kr9', route: 'Kiambu Road', area: 'Edenville', fee: 800 },
  { id: 'kr10', route: 'Kiambu Road', area: 'Kirigiti', fee: 850 },
  { id: 'kr11', route: 'Kiambu Road', area: 'Kiambu Town', fee: 900 },
  { id: 'tr1', route: 'Thika Road', area: 'Pangani / Ngara / Guru Nanak', fee: 600 },
  { id: 'tr2', route: 'Thika Road', area: 'Ruaraka / Allsops', fee: 650 },
  { id: 'tr3', route: 'Thika Road', area: 'Garden City Mall', fee: 650 },
  { id: 'tr4', route: 'Thika Road', area: 'Roysambu', fee: 700 },
  { id: 'tr5', route: 'Thika Road', area: 'Kasarani (ICPAC, Mwiki)', fee: 750 },
  { id: 'tr6', route: 'Thika Road', area: 'Githurai 44 / 45', fee: 800 },
  { id: 'tr7', route: 'Thika Road', area: 'Kahawa Sukari / Wendani', fee: 850 },
  { id: 'tr8', route: 'Thika Road', area: 'Kenyatta University (KU)', fee: 900 },
  { id: 'tr9', route: 'Thika Road', area: 'Ruiru (Kimbo, Kihunguro)', fee: 1000 },
  { id: 'tr10', route: 'Thika Road', area: 'Juja (High Point, Kalimoni)', fee: 1100 },
  { id: 'tr11', route: 'Thika Road', area: 'Thika Town', fee: 1300 },
  { id: 'mr1', route: 'Mombasa Road', area: 'Nairobi West', fee: 400 },
  { id: 'mr2', route: 'Mombasa Road', area: 'South C (Five Star, Akila)', fee: 400 },
  { id: 'mr3', route: 'Mombasa Road', area: 'South B (Hazina, Golden Gate)', fee: 450 },
  { id: 'mr4', route: 'Mombasa Road', area: 'Bellevue / Panari', fee: 450 },
  { id: 'mr5', route: 'Mombasa Road', area: 'Imara Daima (Villa Franca)', fee: 550 },
  { id: 'mr6', route: 'Mombasa Road', area: 'General Motors (GM) / Cabanas', fee: 550 },
  { id: 'mr7', route: 'Mombasa Road', area: 'JKIA / Airport Area', fee: 650 },
  { id: 'mr8', route: 'Mombasa Road', area: 'Syokimau (Katani Road)', fee: 650 },
  { id: 'mr9', route: 'Mombasa Road', area: 'Mlolongo / Sabaki', fee: 750 },
  { id: 'mr10', route: 'Mombasa Road', area: 'Athi River', fee: 900 },
  { id: 'mr11', route: 'Mombasa Road', area: 'Kitengela', fee: 950 },
]

const BUSINESS_SEED = {
  name: 'Rolling Pin',
  tagline: 'Artisan Tea Cakes',
  location: 'Nairobi, Kenya',
  speciality: 'Tea cakes made for slow mornings, afternoon chai & gifting.',
  phone: '0797 528 174',
  whatsapp: '254797528174',
  instagram: 'rollingpinke',
  tiktok: 'rollingpinke',
  deliveryNote: 'Pick your area below to see the delivery fee — it’s added to your total and paid on the day.',
  noticeHours: 48,
  depositRate: 0.5,
  deliveryZones: DELIVERY_ZONES_SEED,
}

const SETTINGS_DEFAULTS = { whatsappBackup: false, acceptingOrders: true }

// Make a clean product from whatever the admin sent, filling sensible defaults.
function cleanProduct(raw = {}, existing = {}) {
  const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const name = raw.name ?? existing.name ?? 'New cake'
  return {
    id: existing.id || raw.id || slug(name) || crypto.randomUUID(),
    name,
    category: raw.category ?? existing.category ?? 'Cakes',
    emoji: raw.emoji ?? existing.emoji ?? '🍰',
    tag: raw.tag === '' ? null : (raw.tag ?? existing.tag ?? null),
    blurb: raw.blurb ?? existing.blurb ?? '',
    art: raw.art ?? existing.art ?? 'linear-gradient(160deg, #ecdcc2, #c9a376)',
    price: Number(raw.price ?? existing.price ?? 0),
    image: raw.image === undefined ? (existing.image ?? null) : raw.image,
    weight: raw.weight ?? existing.weight ?? '800g',
    soldOut: raw.soldOut === undefined ? (existing.soldOut ?? false) : Boolean(raw.soldOut),
    sort: Number(raw.sort ?? existing.sort ?? 0),
  }
}

// Make a clean delivery zone from whatever the admin sent.
function cleanZone(raw = {}, existing = {}) {
  return {
    id: existing.id || raw.id || `dz-${crypto.randomUUID().slice(0, 8)}`,
    route: String(raw.route ?? existing.route ?? 'Other').trim() || 'Other',
    area: String(raw.area ?? existing.area ?? '').trim(),
    fee: Math.max(0, Math.round(Number(raw.fee ?? existing.fee ?? 0)) || 0),
  }
}

// Build the app-shaped order the frontend expects from the raw fields we collected.
function buildOrder(details, payment) {
  const total = Number(details.total)
  const amountPaid = Number(payment.amountPaid)
  return {
    id: crypto.randomUUID(),
    code: genCode(),
    productId: details.productId,
    productName: details.productName,
    emoji: details.emoji,
    art: details.art,
    weight: details.weight,
    qty: details.qty,
    unitPrice: details.unitPrice,
    fulfillment: details.fulfillment,
    date: details.date,
    address: details.address || '',
    deliveryZone: details.deliveryZone || '',
    deliveryFee: Number(details.deliveryFee) || 0,
    customer: {
      name: details.customer?.name || '',
      phone: details.customer?.phone || '',
      email: details.customer?.email || '',
    },
    message: details.message || '',
    total,
    amountPaid,
    balance: Math.max(0, total - amountPaid),
    paymentRef: payment.paymentRef,
    paymentChannel: payment.paymentChannel || null,
    paymentStatus: amountPaid >= total ? 'Paid in full' : 'Deposit paid',
    status: 'New',
    createdAt: new Date().toISOString(),
  }
}

// Split a data URL ("data:image/png;base64,....") into its mime + raw bytes.
function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '')
  if (!m) throw new Error('Expected a base64 data URL for the image.')
  const mime = m[1]
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] || 'jpg'
  return { mime, ext, buffer: Buffer.from(m[2], 'base64') }
}

/* ------------------------------------------------------------------ *
 * Supabase implementation
 * ------------------------------------------------------------------ */
async function supabaseStore() {
  const { createClient } = await importSupabase()
  const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

  const rowToOrder = (r) => ({
    id: r.id,
    code: r.code,
    productId: r.product_id,
    productName: r.product_name,
    emoji: r.emoji,
    art: r.art,
    weight: r.weight,
    qty: r.qty,
    unitPrice: r.unit_price == null ? null : Number(r.unit_price),
    fulfillment: r.fulfillment,
    date: r.date,
    address: r.address,
    customer: { name: r.customer_name, phone: r.customer_phone, email: r.customer_email },
    message: r.message,
    total: r.total == null ? null : Number(r.total),
    amountPaid: r.amount_paid == null ? null : Number(r.amount_paid),
    balance: r.balance == null ? null : Number(r.balance),
    paymentRef: r.payment_ref,
    paymentChannel: r.payment_channel,
    paymentStatus: r.payment_status,
    status: r.status,
    createdAt: r.created_at,
  })

  const orderToRow = (o) => ({
    id: o.id,
    code: o.code,
    product_id: o.productId,
    product_name: o.productName,
    emoji: o.emoji,
    art: o.art,
    weight: o.weight,
    qty: o.qty,
    unit_price: o.unitPrice,
    fulfillment: o.fulfillment,
    date: o.date,
    address: o.address,
    customer_name: o.customer.name,
    customer_phone: o.customer.phone,
    customer_email: o.customer.email,
    message: o.message,
    total: o.total,
    amount_paid: o.amountPaid,
    balance: o.balance,
    payment_ref: o.paymentRef,
    payment_channel: o.paymentChannel,
    payment_status: o.paymentStatus,
    status: o.status,
    created_at: o.createdAt,
  })

  const rowToProduct = (r) => ({
    id: r.id, name: r.name, category: r.category, emoji: r.emoji, tag: r.tag,
    blurb: r.blurb, art: r.art, price: r.price == null ? 0 : Number(r.price),
    image: r.image, weight: r.weight, soldOut: Boolean(r.sold_out), sort: r.sort ?? 0,
  })
  const productToRow = (p) => ({
    id: p.id, name: p.name, category: p.category, emoji: p.emoji, tag: p.tag,
    blurb: p.blurb, art: p.art, price: p.price, image: p.image, weight: p.weight,
    sold_out: p.soldOut, sort: p.sort,
  })

  // Seed products + business the first time, so a fresh DB isn't empty.
  const seedIfEmpty = async () => {
    const { count } = await db.from('products').select('id', { count: 'exact', head: true })
    if (!count) await db.from('products').insert(PRODUCTS_SEED.map(productToRow))
    const biz = await db.from('business').select('data').eq('id', 1).maybeSingle()
    if (!biz.data) await db.from('business').upsert({ id: 1, data: BUSINESS_SEED })
  }
  await seedIfEmpty()

  return {
    async listOrders() {
      const { data, error } = await db.from('orders').select('*').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data.map(rowToOrder)
    },
    async getOrderByCode(code) {
      const { data, error } = await db.from('orders').select('*').ilike('code', code.trim()).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? rowToOrder(data) : null
    },
    async upsertPaidOrder(details, payment) {
      const existing = await db.from('orders').select('*').eq('payment_ref', payment.paymentRef).maybeSingle()
      if (existing.data) return rowToOrder(existing.data)
      const order = buildOrder(details, payment)
      const { data, error } = await db.from('orders').insert(orderToRow(order)).select().single()
      if (error) throw new Error(error.message)
      return rowToOrder(data)
    },
    async setStatus(id, status) {
      const { data, error } = await db.from('orders').update({ status }).eq('id', id).select().maybeSingle()
      if (error) throw new Error(error.message)
      return data ? rowToOrder(data) : null
    },
    async deleteOrder(id) {
      const { error } = await db.from('orders').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    async listProducts() {
      const { data, error } = await db.from('products').select('*').order('sort', { ascending: true })
      if (error) throw new Error(error.message)
      return data.map(rowToProduct)
    },
    async createProduct(patch) {
      // Give a new product a sort that places it at the end, mirroring file mode.
      let sort = patch.sort
      if (sort === undefined || sort === null) {
        const { data: rows } = await db.from('products').select('sort')
        sort = (rows || []).reduce((m, r) => Math.max(m, r.sort ?? 0), -1) + 1
      }
      const product = cleanProduct({ ...patch, sort })
      const { data, error } = await db.from('products').insert(productToRow(product)).select().single()
      if (error) throw new Error(error.message)
      return rowToProduct(data)
    },
    async updateProduct(id, patch) {
      const cur = await db.from('products').select('*').eq('id', id).maybeSingle()
      if (!cur.data) return null
      const product = cleanProduct({ ...patch, id }, rowToProduct(cur.data))
      const { data, error } = await db.from('products').update(productToRow(product)).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return rowToProduct(data)
    },
    async deleteProduct(id) {
      const { error } = await db.from('products').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    async getBusiness() {
      const { data, error } = await db.from('business').select('data').eq('id', 1).maybeSingle()
      if (error) throw new Error(error.message)
      return { ...BUSINESS_SEED, ...(data?.data || {}) }
    },
    async setBusiness(patch) {
      const current = await this.getBusiness()
      const next = { ...current, ...patch }
      const { error } = await db.from('business').upsert({ id: 1, data: next })
      if (error) throw new Error(error.message)
      return next
    },

    async getSettings() {
      const { data, error } = await db.from('settings').select('*').eq('id', 1).maybeSingle()
      if (error) throw new Error(error.message)
      return {
        whatsappBackup: Boolean(data?.whatsapp_backup),
        acceptingOrders: data?.accepting_orders == null ? true : Boolean(data.accepting_orders),
      }
    },
    async setSettings(patch) {
      const row = { id: 1 }
      if ('whatsappBackup' in patch) row.whatsapp_backup = Boolean(patch.whatsappBackup)
      if ('acceptingOrders' in patch) row.accepting_orders = Boolean(patch.acceptingOrders)
      const { data, error } = await db.from('settings').upsert(row).select().single()
      if (error) throw new Error(error.message)
      return {
        whatsappBackup: Boolean(data.whatsapp_backup),
        acceptingOrders: data.accepting_orders == null ? true : Boolean(data.accepting_orders),
      }
    },

    async uploadImage(dataUrl) {
      const { ext, mime, buffer } = parseDataUrl(dataUrl)
      await db.storage.createBucket(IMAGE_BUCKET, { public: true }).catch(() => {})
      const name = `${crypto.randomUUID()}.${ext}`
      const { error } = await db.storage.from(IMAGE_BUCKET).upload(name, buffer, { contentType: mime, upsert: false })
      if (error) throw new Error(error.message)
      const { data } = db.storage.from(IMAGE_BUCKET).getPublicUrl(name)
      return { url: data.publicUrl }
    },
  }
}

// Lazy import so the dependency is only required when Supabase is actually used.
async function importSupabase() {
  return import('@supabase/supabase-js')
}

/* ------------------------------------------------------------------ *
 * Local JSON-file implementation (single machine, no external service)
 * ------------------------------------------------------------------ */
function fileStore() {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const FILE = path.join(dir, 'data.json')
  const UPLOADS = path.join(dir, 'uploads')

  const read = () => {
    let data
    try {
      data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    } catch {
      data = {}
    }
    if (!Array.isArray(data.orders)) data.orders = []
    if (!Array.isArray(data.products)) data.products = PRODUCTS_SEED.map((p) => ({ ...p }))
    if (!data.business) data.business = { ...BUSINESS_SEED }
    data.settings = { ...SETTINGS_DEFAULTS, ...(data.settings || {}) }
    return data
  }
  const write = (data) => fs.writeFileSync(FILE, JSON.stringify(data, null, 2))

  return {
    async listOrders() {
      return read().orders.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    },
    async getOrderByCode(code) {
      const target = code.trim().toUpperCase()
      return read().orders.find((o) => o.code.toUpperCase() === target) || null
    },
    async upsertPaidOrder(details, payment) {
      const data = read()
      const existing = data.orders.find((o) => o.paymentRef === payment.paymentRef)
      if (existing) return existing
      let order = buildOrder(details, payment)
      while (data.orders.some((o) => o.code === order.code)) order = buildOrder(details, payment)
      data.orders.push(order)
      write(data)
      return order
    },
    async setStatus(id, status) {
      const data = read()
      const order = data.orders.find((o) => o.id === id)
      if (!order) return null
      order.status = status
      write(data)
      return order
    },
    async deleteOrder(id) {
      const data = read()
      data.orders = data.orders.filter((o) => o.id !== id)
      write(data)
    },

    async listProducts() {
      return read().products.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    },
    async createProduct(patch) {
      const data = read()
      const sort = data.products.reduce((m, p) => Math.max(m, p.sort ?? 0), -1) + 1
      let product = cleanProduct({ sort, ...patch })
      while (data.products.some((p) => p.id === product.id)) product = cleanProduct({ ...patch, id: `${product.id}-${Math.floor(Math.random() * 1000)}`, sort })
      data.products.push(product)
      write(data)
      return product
    },
    async updateProduct(id, patch) {
      const data = read()
      const idx = data.products.findIndex((p) => p.id === id)
      if (idx === -1) return null
      const product = cleanProduct({ ...patch, id }, data.products[idx])
      data.products[idx] = product
      write(data)
      return product
    },
    async deleteProduct(id) {
      const data = read()
      data.products = data.products.filter((p) => p.id !== id)
      write(data)
    },

    async getBusiness() {
      return { ...BUSINESS_SEED, ...read().business }
    },
    async setBusiness(patch) {
      const data = read()
      data.business = { ...BUSINESS_SEED, ...data.business, ...patch }
      write(data)
      return data.business
    },

    async getSettings() {
      return { ...SETTINGS_DEFAULTS, ...read().settings }
    },
    async setSettings(patch) {
      const data = read()
      data.settings = { ...SETTINGS_DEFAULTS, ...data.settings, ...patch }
      write(data)
      return data.settings
    },

    async uploadImage(dataUrl) {
      const { ext, buffer } = parseDataUrl(dataUrl)
      fs.mkdirSync(UPLOADS, { recursive: true })
      const name = `${crypto.randomUUID()}.${ext}`
      fs.writeFileSync(path.join(UPLOADS, name), buffer)
      return { url: `/uploads/${name}` }
    },
  }
}

// `supabaseStore` uses top-level await indirectly; resolve the store once here.
const store = useSupabase ? await supabaseStore() : fileStore()

export const { STATUS_NEXT } = { STATUS_NEXT: STATUS_FLOW }
export const listOrders = (...a) => store.listOrders(...a)
export const getOrderByCode = (...a) => store.getOrderByCode(...a)
export const upsertPaidOrder = (...a) => store.upsertPaidOrder(...a)
export const setStatus = (...a) => store.setStatus(...a)
export const deleteOrder = (...a) => store.deleteOrder(...a)
export const listProducts = (...a) => store.listProducts(...a)
export const createProduct = (...a) => store.createProduct(...a)
export const updateProduct = (...a) => store.updateProduct(...a)
export const deleteProduct = (...a) => store.deleteProduct(...a)
export const getBusiness = (...a) => store.getBusiness(...a)
export const setBusiness = (...a) => store.setBusiness(...a)
export const getSettings = (...a) => store.getSettings(...a)
export const setSettings = (...a) => store.setSettings(...a)
export const uploadImage = (...a) => store.uploadImage(...a)

/* Delivery zones live inside the business record as a plain array, so their CRUD is
 * the same in both storage modes — read the business, edit the array, write it back. */
export async function listDeliveryZones() {
  const b = await store.getBusiness()
  return Array.isArray(b.deliveryZones) ? b.deliveryZones : []
}
export async function createDeliveryZone(patch) {
  const zones = await listDeliveryZones()
  let zone = cleanZone(patch)
  while (zones.some((z) => z.id === zone.id)) zone = cleanZone({ ...patch, id: undefined })
  await store.setBusiness({ deliveryZones: [...zones, zone] })
  return zone
}
export async function updateDeliveryZone(id, patch) {
  const zones = await listDeliveryZones()
  const idx = zones.findIndex((z) => z.id === id)
  if (idx === -1) return null
  const zone = cleanZone({ ...patch, id }, zones[idx])
  const next = zones.slice()
  next[idx] = zone
  await store.setBusiness({ deliveryZones: next })
  return zone
}
export async function deleteDeliveryZone(id) {
  const zones = await listDeliveryZones()
  await store.setBusiness({ deliveryZones: zones.filter((z) => z.id !== id) })
  return { ok: true }
}
