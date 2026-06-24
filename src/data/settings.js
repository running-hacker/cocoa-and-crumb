// Settings live in the shared backend too, so toggling the WhatsApp backup or
// pausing orders from the Kitchen applies on every device. Reading is public
// (the storefront needs it); changing a setting is admin-only.

import { authFetch } from './auth.js'

const API = import.meta.env.VITE_API_URL || ''

const DEFAULTS = {
  // WhatsApp is an optional backup only. Orders are placed inside the app;
  // when this is on, customers also get a "send a copy on WhatsApp" button.
  whatsappBackup: false,
  // Master switch — when off, the storefront stops taking new orders.
  acceptingOrders: true,
}

export async function getSettings() {
  try {
    const r = await fetch(`${API}/api/settings`)
    if (!r.ok) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(await r.json()) }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function setSetting(key, value) {
  const r = await authFetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Could not save the setting.')
  window.dispatchEvent(new Event('settings-updated'))
  return { ...DEFAULTS, ...data }
}
