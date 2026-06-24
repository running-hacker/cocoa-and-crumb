// Order store — talks to the shared backend so the Kitchen dashboard is live on
// every device. Orders are CREATED by the server when a payment is verified, so
// there is no createOrder() here; the app only reads and updates them. The list
// and every mutation carry customer details, so they go through authFetch (admin
// only); looking up a single order by its code stays public for the Track page.

import { authFetch } from './auth.js'

const API = import.meta.env.VITE_API_URL || ''

export const STATUSES = ['New', 'Baking', 'Ready', 'Completed']

export const STATUS_FLOW = {
  New: 'Baking',
  Baking: 'Ready',
  Ready: 'Completed',
  Completed: null,
}

// Let any screen know orders changed so it can refresh immediately (the dashboard
// also polls, but this makes our own actions feel instant).
function announce() {
  window.dispatchEvent(new Event('orders-updated'))
}

async function jsonOrThrow(r, fallback) {
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || fallback)
  return data
}

export async function getOrders() {
  const r = await authFetch('/api/orders')
  return jsonOrThrow(r, 'Could not load orders.')
}

export async function getOrderByCode(code) {
  const r = await fetch(`${API}/api/orders/${encodeURIComponent(code.trim())}`)
  if (r.status === 404) return null
  return jsonOrThrow(r, 'Could not look up that order.')
}

export async function setStatus(id, status) {
  const r = await authFetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const order = await jsonOrThrow(r, 'Could not update the order.')
  announce()
  return order
}

export async function advanceOrder(order) {
  const next = STATUS_FLOW[order.status]
  if (!next) return order
  return setStatus(order.id, next)
}

export async function deleteOrder(id) {
  const r = await authFetch(`/api/orders/${id}`, { method: 'DELETE' })
  if (!r.ok && r.status !== 204) {
    const data = await r.json().catch(() => ({}))
    throw new Error(data.error || 'Could not delete the order.')
  }
  announce()
}
