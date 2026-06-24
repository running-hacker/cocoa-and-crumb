import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getProducts, imageUrl } from '../data/products.js'
import { getSettings } from '../data/settings.js'
import { BUSINESS, formatPrice, depositFor, getBusiness } from '../data/business.js'
import { initializePayment } from '../data/payments.js'

const QUANTITIES = [1, 2, 3, 4, 5, 6]

function minDate() {
  const d = new Date()
  d.setDate(d.getDate() + Math.ceil(BUSINESS.noticeHours / 24))
  // Build the date string from local parts — toISOString() is UTC and would roll the
  // earliest selectable day back to "yesterday" for our customers in EAT (UTC+3).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Order() {
  const { productId } = useParams()

  const [products, setProducts] = useState([])
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(true)
  const [qty, setQty] = useState(1)
  const [fulfillment, setFulfillment] = useState('Pickup')
  const [zones, setZones] = useState([])
  const [deliveryZoneId, setDeliveryZoneId] = useState('')
  const [date, setDate] = useState('')
  const [address, setAddress] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [payChoice, setPayChoice] = useState('deposit')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([getProducts(), getSettings(), getBusiness().catch(() => ({}))])
      .then(([list, settings, business]) => {
        if (!alive) return
        setProducts(list)
        setZones(Array.isArray(business.deliveryZones) ? business.deliveryZones : [])
        const available = list.filter((p) => !p.soldOut)
        const initial =
          list.find((p) => p.id === productId && !p.soldOut) || available[0] || null
        setProduct(initial)
        setAccepting(Boolean(settings.acceptingOrders))
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [productId])

  const selectable = useMemo(() => products.filter((p) => !p.soldOut), [products])
  const isDelivery = fulfillment === 'Delivery'
  const selectedZone = useMemo(
    () => zones.find((z) => z.id === deliveryZoneId) || null,
    [zones, deliveryZoneId],
  )
  // Areas grouped by road, for the <optgroup> dropdown.
  const zonesByRoute = useMemo(() => {
    const groups = []
    for (const z of zones) {
      let g = groups.find((x) => x.route === z.route)
      if (!g) { g = { route: z.route, items: [] }; groups.push(g) }
      g.items.push(z)
    }
    return groups
  }, [zones])

  const cake = product ? product.price * qty : 0
  const deliveryFee = isDelivery && selectedZone ? selectedZone.fee : 0
  const total = cake + deliveryFee
  const deposit = depositFor(cake) // deposit is a share of the cake only; delivery is paid on the day
  const amountToPay = payChoice === 'full' ? total : deposit
  const balance = total - amountToPay

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!product) return
    if (!name.trim() || !phone.trim() || !email.trim() || !date) {
      setError('Please add your name, phone, email and the date you need it — Paystack emails your receipt.')
      return
    }
    if (isDelivery && !selectedZone) {
      setError('Please choose your delivery area so we can add the delivery fee.')
      return
    }
    if (isDelivery && !address.trim()) {
      setError('Please add a delivery address (or switch to pickup).')
      return
    }
    setSubmitting(true)
    // The whole order rides along to the server, which stores it on the Paystack
    // transaction. It becomes a real order only once the payment is verified.
    const order = {
      productId: product.id,
      productName: product.name,
      emoji: product.emoji,
      art: product.art,
      weight: product.weight,
      qty,
      unitPrice: product.price,
      fulfillment,
      date,
      address: address.trim(),
      deliveryZoneId: isDelivery ? deliveryZoneId : '',
      deliveryZone: isDelivery && selectedZone ? `${selectedZone.route} · ${selectedZone.area}` : '',
      deliveryFee,
      customer: { name: name.trim(), phone: phone.trim(), email: email.trim() },
      message: message.trim(),
      total,
    }
    try {
      const { authorizationUrl } = await initializePayment({
        order,
        amountToPay,
        callbackUrl: `${window.location.origin}/payment/callback`,
      })
      window.location.href = authorizationUrl
    } catch (err) {
      setError(`${err.message} You can also reach ${BUSINESS.name} on WhatsApp.`)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <section className="section">
        <div className="container"><p className="menu-empty">Loading…</p></div>
      </section>
    )
  }

  if (!accepting) {
    return (
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">Orders paused</div>
            <h2>We&apos;re not taking orders right now</h2>
            <p>{BUSINESS.name} has paused new orders for the moment. Please check back
              soon, or reach us on {BUSINESS.phone} — we&apos;d love to bake for you.</p>
          </div>
        </div>
      </section>
    )
  }

  if (!product) {
    return (
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">Place an order</div>
            <h2>Our menu is being updated</h2>
            <p>There are no cakes available to order just now — please check back soon.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="section">
      <div className="container">
        <div className="section-head" style={{ marginBottom: 36 }}>
          <div className="eyebrow">Place an order</div>
          <h2>Let&apos;s bake something for you</h2>
          <p>Choose your cake and the details below. Orders need at least {BUSINESS.noticeHours} hours notice.</p>
        </div>

        <form className="order-wrap" onSubmit={submit}>
          <div className="panel">
            <div className="field">
              <label>Choose your cake</label>
              <div className="option-row">
                {selectable.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`option ${product.id === p.id ? 'active' : ''}`}
                    onClick={() => setProduct(p)}
                  >
                    {p.emoji} {p.name}<span className="op-price">{formatPrice(p.price)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>How many? <span className="hint">{product.weight} loaf each</span></label>
              <div className="option-row">
                {QUANTITIES.map((q) => (
                  <button
                    type="button"
                    key={q}
                    className={`option ${qty === q ? 'active' : ''}`}
                    onClick={() => setQty(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '10px 2px 0' }}>
                Need a bigger order or a custom size? Pop it in the special requests below.
              </p>
            </div>

            <div className="field">
              <label>How would you like it?</label>
              <div className="option-row">
                {['Pickup', 'Delivery'].map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`option ${fulfillment === opt ? 'active' : ''}`}
                    onClick={() => setFulfillment(opt)}
                  >
                    {opt === 'Pickup' ? '🏠 Pickup' : '🛵 Delivery'}
                  </button>
                ))}
              </div>
              {isDelivery && (
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '10px 2px 0' }}>
                  {BUSINESS.deliveryNote}
                </p>
              )}
            </div>

            {isDelivery && (
              <div className="field">
                <label>Delivery area <span className="hint">fee added to your total</span></label>
                <select className="input" value={deliveryZoneId} onChange={(e) => setDeliveryZoneId(e.target.value)}>
                  <option value="">Select your area…</option>
                  {zonesByRoute.map((g) => (
                    <optgroup key={g.route} label={g.route}>
                      {g.items.map((z) => (
                        <option key={z.id} value={z.id}>{z.area} — {formatPrice(z.fee)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            {isDelivery && (
              <div className="field">
                <label>Delivery address <span className="hint">building, house, landmark</span></label>
                <input className="input" value={address} placeholder="e.g. Rose Apartments, House 4"
                  onChange={(e) => setAddress(e.target.value)} />
              </div>
            )}

            <div className="field">
              <label>When do you need it?</label>
              <input
                type="date"
                className="input"
                min={minDate()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Your name</label>
              <input className="input" value={name} placeholder="Jane Doe"
                onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="option-row" style={{ gap: 22 }}>
              <div className="field" style={{ flex: 1, minWidth: 200 }}>
                <label>Phone</label>
                <input className="input" value={phone} placeholder="07XX XXX XXX"
                  onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 200 }}>
                <label>Email <span className="hint">for your receipt</span></label>
                <input className="input" type="email" value={email} placeholder="you@email.com"
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>Special requests <span className="hint">message on cake, custom size, allergies…</span></label>
              <textarea className="textarea" value={message}
                placeholder="e.g. 'Happy Birthday Mum' on top, no nuts please"
                onChange={(e) => setMessage(e.target.value)} />
            </div>
          </div>

          <aside className="panel summary">
            <div className="sum-art" style={{ background: product.art }}>
              {product.image
                ? <img src={imageUrl(product.image)} alt={product.name} className="sum-img" />
                : <span>{product.emoji}</span>}
            </div>
            <h3 style={{ marginBottom: 16 }}>{product.name}</h3>
            <div className="sum-line"><span>Each</span><span>{product.weight} · {formatPrice(product.price)}</span></div>
            <div className="sum-line"><span>Quantity</span><span>{qty}</span></div>
            <div className="sum-line"><span>Fulfillment</span><span>{fulfillment}</span></div>
            <div className="sum-line"><span>Needed by</span><span>{date || '—'}</span></div>
            {isDelivery && (
              <>
                <div className="sum-line"><span>Area</span><span>{selectedZone ? selectedZone.area : '—'}</span></div>
                <div className="sum-line">
                  <span>Delivery fee</span>
                  <span>{selectedZone ? formatPrice(deliveryFee) : 'Select area'}</span>
                </div>
              </>
            )}
            <div className="sum-total">
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Total</span>
              <span className="price">{formatPrice(total)}</span>
            </div>

            <div className="field" style={{ marginBottom: 8 }}>
              <label>Pay now</label>
              <div className="option-row">
                <button type="button" className={`option ${payChoice === 'deposit' ? 'active' : ''}`}
                  onClick={() => setPayChoice('deposit')}>
                  {Math.round(BUSINESS.depositRate * 100)}% deposit<span className="op-price">{formatPrice(deposit)}</span>
                </button>
                <button type="button" className={`option ${payChoice === 'full' ? 'active' : ''}`}
                  onClick={() => setPayChoice('full')}>
                  Pay in full<span className="op-price">{formatPrice(total)}</span>
                </button>
              </div>
            </div>

            <div className="sum-line">
              <span style={{ fontWeight: 700, color: 'var(--cocoa)' }}>Paying now</span>
              <span style={{ fontWeight: 700, color: 'var(--cocoa)' }}>{formatPrice(amountToPay)}</span>
            </div>
            {balance > 0 && (
              <div className="sum-line" style={{ marginBottom: 16 }}>
                <span>Balance on {fulfillment.toLowerCase()}</span>
                <span>{formatPrice(balance)}</span>
              </div>
            )}

            {error && (
              <p style={{ color: 'var(--berry)', fontSize: '0.85rem', marginTop: 4, marginBottom: 16 }}>
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Taking you to payment…' : `Pay ${formatPrice(amountToPay)} & place order →`}
            </button>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
              Secure payment by Paystack — card or M-Pesa. A {Math.round(BUSINESS.depositRate * 100)}% deposit
              confirms your order{fulfillment === 'Delivery' ? '; balance plus delivery on the day' : '; balance on pickup'}.
            </p>
          </aside>
        </form>
      </div>
    </section>
  )
}
