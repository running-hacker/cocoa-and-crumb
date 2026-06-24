// Admin auth for the Kitchen / management screens. The server hands back a signed
// token (it never contains the password); we keep it in localStorage and attach
// it to admin-only requests. A 401 means the token is gone/expired, so we drop it
// and the UI falls back to the login screen.

const API = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'rp_admin_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function isLoggedIn() {
  return Boolean(getToken())
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore storage errors (private mode etc.) */
  }
  window.dispatchEvent(new Event('admin-auth-changed'))
}

export async function login(password) {
  const r = await fetch(`${API}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Could not sign in.')
  setToken(data.token)
  return true
}

export function logout() {
  setToken('')
}

// fetch() wrapper that attaches the admin token. Use it for every admin-only call.
export async function authFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${API}${path}`, { ...options, headers })
  if (r.status === 401) {
    setToken('') // expired or invalid — clear it so the app shows the login screen
    throw new Error('Your session has expired. Please sign in again.')
  }
  return r
}

// Confirm the stored token is still valid server-side (used when the admin loads).
export async function verifyToken() {
  if (!getToken()) return false
  try {
    const r = await authFetch('/api/admin/me')
    return r.ok
  } catch {
    return false
  }
}
