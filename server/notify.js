// WhatsApp order notifications via the Meta WhatsApp Cloud API.
//
// Because these are business-initiated messages, the Cloud API requires PRE-APPROVED
// message templates (see WHATSAPP.md for the exact templates to create and the env
// vars to set). Everything here is gated: if WhatsApp isn't configured the app runs
// normally and simply skips sending. Sending never throws — a failed notification must
// never break order creation.

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0'
const TOKEN = process.env.WHATSAPP_TOKEN || ''
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
const LANG = process.env.WHATSAPP_LANG || 'en'
const TEMPLATE_CUSTOMER = process.env.WHATSAPP_TEMPLATE_CUSTOMER || 'order_confirmation'
const TEMPLATE_OWNER = process.env.WHATSAPP_TEMPLATE_OWNER || 'new_order'
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.WHATSAPP_DRY_RUN || '').toLowerCase())

export function whatsappConfigured() {
  return Boolean(TOKEN && PHONE_ID)
}

// Normalise a Kenyan phone number to WhatsApp's international format (no +, e.g.
// 254797528174). Accepts "0797 528 174", "+254797528174", "797528174", etc.
export function toIntlKE(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('254')) return digits
  if (digits.startsWith('0')) return '254' + digits.slice(1)
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return '254' + digits
  return digits // already international or unknown — hand it over as-is
}

function ksh(n) {
  return `KSH ${Number(n || 0).toLocaleString('en-KE')}`
}

// Send one template message. Returns a small result object and never throws.
async function sendTemplate(to, templateName, params) {
  if (!to) return { ok: false, skipped: 'no recipient number' }

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: LANG },
      components: params.length
        ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }]
        : [],
    },
  }

  if (DRY_RUN || !whatsappConfigured()) {
    const tag = DRY_RUN ? 'dry-run' : 'skipped — not configured'
    console.log(`[whatsapp:${tag}] -> ${to} template="${templateName}" params=${JSON.stringify(params)}`)
    return { ok: DRY_RUN, skipped: !DRY_RUN }
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000), // don't hang the request waiting on Meta
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error(`[whatsapp] send to ${to} failed (${r.status}):`, data?.error?.message || data)
      return { ok: false, error: data?.error?.message || `HTTP ${r.status}` }
    }
    return { ok: true, id: data?.messages?.[0]?.id }
  } catch (e) {
    console.error(`[whatsapp] send to ${to} errored:`, e.message)
    return { ok: false, error: e.message }
  }
}

// Notify the customer (their confirmation) and the kitchen (a new-order alert) about a
// freshly placed order. Both sends are attempted; failures are logged, not thrown.
export async function notifyOrderPlaced(order, ownerNumber) {
  if (!order) return

  const first = String(order.customer?.name || '').trim().split(/\s+/)[0] || 'there'
  const item = `${order.qty} × ${order.productName}${order.weight ? ` (${order.weight})` : ''}`
  const fulfilment = order.fulfillment === 'Delivery' ? 'Delivery' : 'Pickup'
  const fulfilmentDetail =
    order.fulfillment === 'Delivery'
      ? `Delivery${order.deliveryZone ? ` — ${order.deliveryZone}` : ''}`
      : 'Pickup'

  // NOTE: these parameter lists must match the {{1}}..{{n}} order of the approved
  // templates in WHATSAPP.md. Keep the two in sync if you change either.
  const customerParams = [
    first, order.code, item, fulfilment, order.date,
    ksh(order.total), ksh(order.amountPaid), ksh(order.balance),
  ]
  const ownerParams = [
    order.code, item, order.customer?.name || '—', order.customer?.phone || '—',
    fulfilmentDetail, order.date, ksh(order.balance),
  ]

  const customerTo = toIntlKE(order.customer?.phone)
  const ownerTo = toIntlKE(process.env.OWNER_WHATSAPP || ownerNumber)

  const [customer, owner] = await Promise.allSettled([
    sendTemplate(customerTo, TEMPLATE_CUSTOMER, customerParams),
    sendTemplate(ownerTo, TEMPLATE_OWNER, ownerParams),
  ])
  return { customer, owner }
}
