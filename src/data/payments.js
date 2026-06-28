// Talks to the payment server. The frontend never sees the Paystack secret key —
// it only asks the server to start a payment and to confirm one afterwards.
//
// The full order travels to the server, which tucks it into the Paystack
// transaction's metadata. When the payment is verified (or the webhook fires),
// the server reads that metadata back and creates the order — so nothing needs to
// be stashed in the browser while the customer is away paying.

const API = import.meta.env.VITE_API_URL || ''

export async function initializePayment({ order, amountToPay, callbackUrl }) {
  const r = await fetch(`${API}/api/paystack/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order, amountToPay, callbackUrl }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Could not start the payment. Please try again.')
  return data // { authorizationUrl, accessCode, reference }
}

export async function verifyPayment(reference) {
  const r = await fetch(`${API}/api/paystack/verify/${encodeURIComponent(reference)}`)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Could not confirm the payment.')
  return data // { paid, status, order }
}

// Pay the remaining balance on an existing order (from the Track page). The server
// works out the amount from the order itself, so only the order code is needed.
export async function payBalance({ code, callbackUrl }) {
  const r = await fetch(`${API}/api/paystack/pay-balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, callbackUrl }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Could not start the balance payment. Please try again.')
  return data // { authorizationUrl, accessCode, reference }
}
