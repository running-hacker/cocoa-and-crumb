// Admin CRUD for delivery areas. The public list ships inside GET /api/business
// (its `deliveryZones` array); these helpers edit it (admin-only) and then refresh
// the in-place BUSINESS copy so the live storefront reflects the change immediately.

import { authFetch } from './auth.js'
import { loadBusinessConfig } from './business.js'

const API = import.meta.env.VITE_API_URL || ''

export async function getDeliveryZones() {
  const r = await fetch(`${API}/api/business`)
  if (!r.ok) throw new Error('Could not load delivery areas.')
  const b = await r.json()
  return Array.isArray(b.deliveryZones) ? b.deliveryZones : []
}

// Keep BUSINESS.deliveryZones (and anything listening) in sync after an edit.
async function afterChange() {
  await loadBusinessConfig().catch(() => {})
  window.dispatchEvent(new Event('business-updated'))
}

export async function addDeliveryZone(patch) {
  const r = await authFetch('/api/delivery-zones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Could not add the area.')
  await afterChange()
  return data
}

export async function editDeliveryZone(id, patch) {
  const r = await authFetch(`/api/delivery-zones/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Could not save the area.')
  await afterChange()
  return data
}

export async function removeDeliveryZone(id) {
  const r = await authFetch(`/api/delivery-zones/${id}`, { method: 'DELETE' })
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    throw new Error(data.error || 'Could not delete the area.')
  }
  await afterChange()
  return { ok: true }
}
