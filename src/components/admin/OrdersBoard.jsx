import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  getOrders,
  advanceOrder,
  deleteOrder,
  STATUSES,
  STATUS_FLOW,
} from '../../data/orders.js'
import { formatPrice } from '../../data/business.js'

export default function OrdersBoard() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setOrders(await getOrders())
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Live-ish across devices: poll, refetch when the tab regains focus, and react
    // immediately to actions taken on this screen.
    const poll = setInterval(refresh, 8000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    window.addEventListener('orders-updated', refresh)
    return () => {
      clearInterval(poll)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('orders-updated', refresh)
    }
  }, [refresh])

  async function handleAdvance(order) {
    // Completing an order is the "hand-over" moment — nudge if money is still owing.
    if (STATUS_FLOW[order.status] === 'Completed' && order.balance > 0) {
      if (!confirm(`${order.code} still has ${formatPrice(order.balance)} owing. Mark it completed anyway?`)) return
    }
    try {
      await advanceOrder(order)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(order) {
    if (!confirm(`Delete order ${order.code}?`)) return
    try {
      await deleteOrder(order.id)
    } catch (e) {
      setError(e.message)
    }
  }

  // Local "today" (not UTC) so "due today" lines up with the kitchen's actual day in EAT.
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const active = orders.filter((o) => o.status !== 'Completed')
  const dueToday = orders.filter((o) => o.date === today && o.status !== 'Completed')
  const revenue = orders
    .filter((o) => o.status === 'Completed')
    .reduce((sum, o) => sum + o.total, 0)
  const collected = orders.reduce((sum, o) => sum + (o.amountPaid || 0), 0)

  return (
    <div className="admin-panel">
      <div className="admin-head">
        <div>
          <div className="eyebrow">Kitchen dashboard</div>
          <h2>Orders</h2>
        </div>
        <Link to="/order" className="btn btn-ghost">+ Add an order</Link>
      </div>

      {error && (
        <p className="empty" style={{ color: 'var(--berry)' }}>
          {error} — is the server running? <code>npm run server</code>
        </p>
      )}

      <div className="stat-row">
        <div className="stat-card"><strong>{orders.length}</strong><span>Total orders</span></div>
        <div className="stat-card"><strong>{active.length}</strong><span>In progress</span></div>
        <div className="stat-card"><strong>{dueToday.length}</strong><span>Due today</span></div>
        <div className="stat-card"><strong>{formatPrice(collected)}</strong><span>Collected</span></div>
        <div className="stat-card"><strong>{formatPrice(revenue)}</strong><span>Completed value</span></div>
      </div>

      {loading ? (
        <div className="confirm"><div className="spinner" /><p style={{ color: 'var(--muted)' }}>Loading orders…</p></div>
      ) : orders.length === 0 ? (
        <p className="empty">
          No orders yet. Place a test order from the{' '}
          <Link to="/order" style={{ color: 'var(--caramel)', fontWeight: 700 }}>order page</Link>{' '}
          to see it appear here.
        </p>
      ) : (
        <div className="board">
          {STATUSES.map((status) => {
            const col = orders.filter((o) => o.status === status)
            return (
              <div className="col" key={status}>
                <div className="col-head">
                  <h4>{status}</h4>
                  <span className="count">{col.length}</span>
                </div>
                {col.map((o) => (
                  <div className="order-card" key={o.id}>
                    <div className="oc-top">
                      <span className="oc-code">{o.code}</span>
                      <span className="oc-date">{o.date}</span>
                    </div>
                    <h5>{o.emoji} {o.productName}</h5>
                    <div className="oc-meta">
                      {o.qty} × {o.weight} · {formatPrice(o.total)}<br />
                      {o.customer.name} · {o.customer.phone}<br />
                      {o.fulfillment}
                      {o.fulfillment === 'Delivery' && o.deliveryZone ? ` · ${o.deliveryZone}` : ''}
                      {o.fulfillment === 'Delivery' && o.deliveryFee > 0 ? ` · delivery ${formatPrice(o.deliveryFee)}` : ''}
                      {o.fulfillment === 'Delivery' && o.address ? ` · ${o.address}` : ''}
                      {o.amountPaid != null && (
                        <><br /><strong style={{ color: 'var(--sage)' }}>
                          {o.paymentStatus} · {formatPrice(o.amountPaid)}
                          {o.balance > 0 ? ` · bal ${formatPrice(o.balance)}` : ''}
                        </strong></>
                      )}
                      {o.message && (
                        <><br /><em style={{ color: 'var(--cocoa)' }}>“{o.message}”</em></>
                      )}
                    </div>
                    <div className="oc-actions">
                      {STATUS_FLOW[o.status] && (
                        <button className="mini-btn" onClick={() => handleAdvance(o)}>
                          → {STATUS_FLOW[o.status]}
                        </button>
                      )}
                      <button
                        className="mini-btn"
                        style={{ flex: '0 0 auto' }}
                        onClick={() => handleDelete(o)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {col.length === 0 && (
                  <p style={{ color: 'var(--muted)', fontSize: '0.82rem', textAlign: 'center', padding: '8px 0' }}>
                    Empty
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
