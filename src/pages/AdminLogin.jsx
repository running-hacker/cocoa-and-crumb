import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, isLoggedIn } from '../data/auth.js'
import { BUSINESS } from '../data/business.js'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Already signed in? Skip straight to the dashboard.
  useEffect(() => {
    if (isLoggedIn()) navigate('/admin', { replace: true })
  }, [navigate])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(password)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">🥐</div>
        <div className="eyebrow" style={{ textAlign: 'center' }}>{BUSINESS.name} · Kitchen</div>
        <h2>Welcome back</h2>
        <p className="login-sub">Sign in to manage orders, your menu and your storefront.</p>

        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            autoFocus
            placeholder="Enter your admin password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in →'}
        </button>

        <Link to="/" className="login-back">← Back to the site</Link>
      </form>
    </div>
  )
}
