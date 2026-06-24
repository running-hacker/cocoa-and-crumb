import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getOrderByCode } from '../data/orders.js'
import { BUSINESS, formatPrice, whatsappOrderUrl } from '../data/business.js'
import { getSettings } from '../data/settings.js'

export default function Confirmation() {
  const { code } = useParams()
  const [order, setOrder] = useState(null)
  const [whatsappBackup, setWhatsappBackup] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([getOrderByCode(code), getSettings()])
      .then(([o, s]) => {
        if (!alive) return
        setOrder(o)
        setWhatsappBackup(s.whatsappBackup)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [code])

  if (loading) {
    return (
      <section className="section">
        <div className="container confirm">
          <div className="spinner" />
          <h2>Loading your order…</h2>
        </div>
      </section>
    )
  }

  if (!order) {
    return (
      <section className="section">
        <div className="container confirm">
          <h2>We couldn&apos;t find that order</h2>
          <p style={{ color: 'var(--muted)' }}>The order code may be wrong.</p>
          <Link to="/" className="btn btn-primary">Back to menu</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="section">
      <div className="container confirm">
        <div className="check">✓</div>
        <div className="eyebrow">Payment received</div>
        <h2>You&apos;re all set, {order.customer.name.split(' ')[0]}!</h2>
        <p style={{ color: 'var(--muted)' }}>
          We&apos;ve received your {order.paymentStatus === 'Paid in full' ? 'payment' : 'deposit'} and
          {' '}{BUSINESS.name} has your order in the kitchen. Save your code below to track your cake any time.
        </p>
        <div className="code-pill">{order.code}</div>

        <div className="panel" style={{ textAlign: 'left', marginTop: 8 }}>
          <div className="sum-line"><span>Cake</span><span>{order.emoji} {order.productName}</span></div>
          <div className="sum-line"><span>Quantity</span><span>{order.qty} × {order.weight}</span></div>
          <div className="sum-line"><span>{order.fulfillment}</span><span>{order.date}</span></div>
          {order.fulfillment === 'Delivery' && order.deliveryZone && (
            <div className="sum-line"><span>Area</span><span>{order.deliveryZone}</span></div>
          )}
          {order.fulfillment === 'Delivery' && order.address && (
            <div className="sum-line"><span>Address</span><span>{order.address}</span></div>
          )}
          {order.fulfillment === 'Delivery' && order.deliveryFee > 0 && (
            <div className="sum-line"><span>Delivery fee</span><span>{formatPrice(order.deliveryFee)}</span></div>
          )}
          <div className="sum-total">
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Total</span>
            <span className="price">{formatPrice(order.total)}</span>
          </div>
          {order.amountPaid != null && (
            <>
              <div className="sum-line">
                <span>{order.paymentStatus || 'Paid'}</span>
                <span style={{ color: 'var(--sage)', fontWeight: 700 }}>{formatPrice(order.amountPaid)}</span>
              </div>
              {order.balance > 0 && (
                <div className="sum-line">
                  <span>Balance on {order.fulfillment.toLowerCase()}</span>
                  <span>{formatPrice(order.balance)}</span>
                </div>
              )}
            </>
          )}
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
            {BUSINESS.name} will confirm the final details with you on <strong>{order.customer.phone}</strong>
            {order.balance > 0 ? '. The balance is settled on the day.' : '.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
          <Link to={`/track?code=${order.code}`} className="btn btn-primary">Track this order</Link>
          <Link to="/" className="btn btn-ghost">Back to menu</Link>
        </div>
        {whatsappBackup && (
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 18 }}>
            Prefer WhatsApp?{' '}
            <a href={whatsappOrderUrl(order)} target="_blank" rel="noreferrer"
              style={{ color: 'var(--caramel)', fontWeight: 700 }}>
              Send a copy to {BUSINESS.name}
            </a>{' '}
            as a backup.
          </p>
        )}
      </div>
    </section>
  )
}
