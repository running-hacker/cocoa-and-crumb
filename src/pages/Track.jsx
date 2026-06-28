import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getOrderByCode, STATUSES } from '../data/orders.js'
import { formatPrice, BUSINESS } from '../data/business.js'
import { payBalance } from '../data/payments.js'

const STEP_COPY = {
  New: { title: 'Order received', icon: '📝', desc: 'We have your order and will confirm shortly.' },
  Baking: { title: 'In the oven', icon: '🧑‍🍳', desc: 'Your treat is being made fresh.' },
  Ready: { title: 'Ready', icon: '🎁', desc: 'Boxed up and ready for you.' },
  Completed: { title: 'Completed', icon: '💛', desc: 'Picked up / delivered. Enjoy!' },
}

export default function Track() {
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') || '')
  const [order, setOrder] = useState(null)
  const [searched, setSearched] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

  async function lookup(value) {
    try {
      setOrder(await getOrderByCode(value))
    } catch {
      setOrder(null)
    }
    setSearched(true)
  }

  async function payNow() {
    setPaying(true)
    setPayError('')
    try {
      const { authorizationUrl } = await payBalance({
        code: order.code,
        callbackUrl: `${window.location.origin}/payment/callback`,
      })
      window.location.href = authorizationUrl
    } catch (e) {
      setPayError(`${e.message} You can also reach ${BUSINESS.name} on WhatsApp.`)
      setPaying(false)
    }
  }

  useEffect(() => {
    const initial = params.get('code')
    if (initial) lookup(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSubmit(e) {
    e.preventDefault()
    if (code.trim()) lookup(code)
  }

  const activeIdx = order ? STATUSES.indexOf(order.status) : -1

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">Track your order</div>
          <h2>Where&apos;s my treat?</h2>
          <p>Pop in the order code from your confirmation to see how it&apos;s coming along.</p>
        </div>

        <form className="track-search" onSubmit={onSubmit}>
          <input
            className="input"
            placeholder="e.g. RP-1234"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ textTransform: 'uppercase' }}
          />
          <button className="btn btn-primary" type="submit">Track</button>
        </form>

        {searched && !order && (
          <p className="empty">No order found for “{code}”. Double-check the code from your confirmation.</p>
        )}

        {order && (
          <>
            <div className="panel" style={{ maxWidth: 560, margin: '0 auto 30px', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem' }}>{order.emoji}</div>
              <h3>{order.productName}</h3>
              <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
                {order.qty} × {order.weight} · {order.fulfillment} on {order.date}
              </p>
              {order.fulfillment === 'Delivery' && order.deliveryZone && (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                  {order.deliveryZone}{order.deliveryFee > 0 ? ` · delivery ${formatPrice(order.deliveryFee)}` : ''}
                </p>
              )}
              {order.amountPaid != null && (
                <p style={{ color: 'var(--sage)', fontWeight: 700, margin: '6px 0 0' }}>
                  {order.paymentStatus} · {formatPrice(order.amountPaid)}
                  {order.balance > 0 ? ` · balance ${formatPrice(order.balance)}` : ''}
                </p>
              )}
              {order.balance > 0 && (
                <>
                  <button className="btn btn-primary btn-block" style={{ marginTop: 16 }}
                    disabled={paying} onClick={payNow}>
                    {paying ? 'Taking you to payment…' : `Pay balance ${formatPrice(order.balance)} →`}
                  </button>
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '10px 0 0' }}>
                    Secure payment by Paystack — card or M-Pesa. Settles your order in full.
                  </p>
                  {payError && (
                    <p style={{ color: 'var(--berry)', fontSize: '0.85rem', margin: '8px 0 0' }}>{payError}</p>
                  )}
                </>
              )}
            </div>

            <div className="timeline">
              {STATUSES.map((s, i) => {
                const state = i < activeIdx ? 'done' : i === activeIdx ? 'current' : ''
                const copy = STEP_COPY[s]
                return (
                  <div className={`step ${state}`} key={s}>
                    <div className="step-dot">
                      <div className="ring">{state === 'done' ? '✓' : copy.icon}</div>
                      {i < STATUSES.length - 1 && <div className="step-line" />}
                    </div>
                    <div className="step-body">
                      <h4>{copy.title}</h4>
                      <p>{copy.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {!searched && (
          <p className="empty">
            Lost your code? <Link to="/" style={{ color: 'var(--caramel)', fontWeight: 700 }}>Browse the menu</Link> or message her directly.
          </p>
        )}
      </div>
    </section>
  )
}
