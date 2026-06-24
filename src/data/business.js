// Single source of truth for business details. These are the built-in defaults;
// loadBusinessConfig() refreshes them from the backend (where the admin edits
// them) by copying values into the exported BUSINESS object in place — so every
// `BUSINESS.x` reference across the app picks up edits without prop-drilling.

import { authFetch } from './auth.js'

const API = import.meta.env.VITE_API_URL || ''

export const BUSINESS = {
  name: 'Rolling Pin',
  tagline: 'Artisan Tea Cakes',
  location: 'Nairobi, Kenya',
  speciality: 'Tea cakes made for slow mornings, afternoon chai & gifting.',
  phone: '0797 528 174',
  whatsapp: '254797528174', // international format, no + or spaces
  instagram: 'rollingpinke',
  tiktok: 'rollingpinke',
  currency: 'KSH', // shown to customers (fixed in code)
  paystackCurrency: 'KES', // ISO code Paystack charges in (fixed in code)
  deliveryNote: 'Pick your area below to see the delivery fee — it’s added to your total and paid on the day.',
  noticeHours: 48,
  depositRate: 0.5, // minimum share of the cake price payable up front
  deliveryZones: [], // [{ id, route, area, fee }] — loaded from the backend
}

// Only these come from / go to the backend. currency & paystackCurrency are fixed.
export const EDITABLE_FIELDS = [
  'name', 'tagline', 'location', 'speciality', 'phone', 'whatsapp',
  'instagram', 'tiktok', 'deliveryNote', 'noticeHours', 'depositRate',
]

export const formatPrice = (n) => `${BUSINESS.currency} ${Number(n).toLocaleString()}`

// Minimum deposit = at least half the price, rounded up to a whole shilling.
export const depositFor = (total) => Math.ceil(total * BUSINESS.depositRate)

export function whatsappOrderUrl(order) {
  const lines = [
    `Hi ${BUSINESS.name}! I'd like to place an order.`,
    '',
    `Order code: ${order.code}`,
    `Item: ${order.productName} (${order.weight}) x${order.qty}`,
    `Total: ${formatPrice(order.total)}`,
    `${order.fulfillment} on ${order.date}`,
  ]
  if (order.fulfillment === 'Delivery') {
    if (order.deliveryZone) lines.push(`Area: ${order.deliveryZone} (${formatPrice(order.deliveryFee)})`)
    if (order.address) lines.push(`Address: ${order.address}`)
  }
  lines.push(`Name: ${order.customer.name}`)
  lines.push(`Phone: ${order.customer.phone}`)
  if (order.message) lines.push(`Note: ${order.message}`)
  return `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`
}

// Copy editable values from a backend payload into BUSINESS in place.
function applyToBusiness(data) {
  for (const key of EDITABLE_FIELDS) {
    if (data[key] !== undefined && data[key] !== null) BUSINESS[key] = data[key]
  }
  // Delivery zones aren't edited through the simple business form, but the storefront
  // needs them to price delivery, so hydrate them separately.
  if (Array.isArray(data.deliveryZones)) BUSINESS.deliveryZones = data.deliveryZones
}

// Refresh BUSINESS from the backend. Call once on app start; safe to ignore errors
// (we just keep the built-in defaults if the server isn't reachable).
export async function loadBusinessConfig() {
  try {
    const r = await fetch(`${API}/api/business`)
    if (r.ok) applyToBusiness(await r.json())
  } catch {
    /* keep defaults */
  }
  return BUSINESS
}

// Admin: read the raw editable record (for the Business editor form).
export async function getBusiness() {
  const r = await fetch(`${API}/api/business`)
  if (!r.ok) throw new Error('Could not load business details.')
  return r.json()
}

// Admin: save edits, update BUSINESS in place, and let the app re-render.
export async function saveBusiness(patch) {
  const r = await authFetch('/api/business', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Could not save business details.')
  applyToBusiness(data)
  window.dispatchEvent(new Event('business-updated'))
  return data
}
