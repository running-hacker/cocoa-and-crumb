import { useState, useEffect, useCallback } from 'react'
import { getSettings, setSetting } from '../../data/settings.js'

// Defined at module scope (not inside the component) so React keeps it mounted across
// re-renders instead of tearing it down and rebuilding it on every settings change.
function Switch({ on, disabled, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={`switch ${on ? 'on' : ''}`}
      onClick={onClick}
    >
      <span className="knob" />
    </button>
  )
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState({ whatsappBackup: false, acceptingOrders: true })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const sync = useCallback(async () => {
    try {
      setSettings(await getSettings())
    } catch {
      /* keep the last known value */
    }
  }, [])

  useEffect(() => {
    sync()
    window.addEventListener('settings-updated', sync)
    return () => window.removeEventListener('settings-updated', sync)
  }, [sync])

  async function toggle(key) {
    setBusy(key)
    setError('')
    try {
      setSettings(await setSetting(key, !settings[key]))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-head">
        <div>
          <div className="eyebrow">Storefront</div>
          <h2>Settings</h2>
        </div>
      </div>

      {error && <p className="empty" style={{ color: 'var(--berry)' }}>{error}</p>}

      <div className="settings-bar">
        <div className="settings-text">
          <strong>Accepting orders</strong>
          <span>
            {settings.acceptingOrders
              ? 'On — customers can place and pay for orders.'
              : 'Off — the order page is paused. Customers are asked to check back soon.'}
          </span>
        </div>
        <Switch
          on={settings.acceptingOrders}
          disabled={busy === 'acceptingOrders'}
          onClick={() => toggle('acceptingOrders')}
        />
      </div>

      <div className="settings-bar">
        <div className="settings-text">
          <strong>WhatsApp backup button</strong>
          <span>
            {settings.whatsappBackup
              ? 'On — customers see an optional “send a copy on WhatsApp” link after ordering.'
              : 'Off — orders stay in the app only. No WhatsApp shown to customers.'}
          </span>
        </div>
        <Switch
          on={settings.whatsappBackup}
          disabled={busy === 'whatsappBackup'}
          onClick={() => toggle('whatsappBackup')}
        />
      </div>
    </div>
  )
}
