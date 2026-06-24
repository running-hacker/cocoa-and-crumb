import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isLoggedIn, verifyToken, logout } from '../data/auth.js'
import { BUSINESS } from '../data/business.js'
import OrdersBoard from '../components/admin/OrdersBoard.jsx'
import MenuManager from '../components/admin/MenuManager.jsx'
import DeliveryManager from '../components/admin/DeliveryManager.jsx'
import BusinessEditor from '../components/admin/BusinessEditor.jsx'
import SettingsPanel from '../components/admin/SettingsPanel.jsx'

const TABS = [
  { id: 'orders', label: 'Orders' },
  { id: 'menu', label: 'Menu' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'business', label: 'Business' },
  { id: 'settings', label: 'Settings' },
]

export default function Admin() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('orders')

  // Gatekeeper: no token -> login; token present but rejected by the server -> login.
  useEffect(() => {
    let alive = true
    if (!isLoggedIn()) {
      navigate('/admin/login', { replace: true })
      return
    }
    verifyToken().then((ok) => {
      if (!alive) return
      if (ok) setReady(true)
      else navigate('/admin/login', { replace: true })
    })
    return () => { alive = false }
  }, [navigate])

  function signOut() {
    logout()
    navigate('/admin/login', { replace: true })
  }

  if (!ready) {
    return (
      <div className="admin-shell">
        <div className="confirm" style={{ minHeight: '60vh' }}>
          <div className="spinner" />
          <p style={{ color: 'var(--muted)' }}>Checking your session…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-bar">
        <div className="admin-bar-inner">
          <div className="admin-brand">
            <span className="admin-logo">🥐</span>
            <div>
              <strong>{BUSINESS.name}</strong>
              <span>Kitchen admin</span>
            </div>
          </div>
          <nav className="admin-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`admin-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="admin-bar-actions">
            <Link to="/" className="admin-link">View site ↗</Link>
            <button className="admin-link" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        {tab === 'orders' && <OrdersBoard />}
        {tab === 'menu' && <MenuManager />}
        {tab === 'delivery' && <DeliveryManager />}
        {tab === 'business' && <BusinessEditor />}
        {tab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  )
}
