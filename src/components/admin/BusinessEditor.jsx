import { useState, useEffect } from 'react'
import { getBusiness, saveBusiness, EDITABLE_FIELDS } from '../../data/business.js'

// Form layout for the editable business fields. currency & paystackCurrency are
// intentionally NOT here — they're fixed in code.
const FIELDS = [
  { key: 'name', label: 'Business name' },
  { key: 'tagline', label: 'Tagline' },
  { key: 'location', label: 'Location' },
  { key: 'speciality', label: 'About / speciality', textarea: true },
  { key: 'phone', label: 'Phone' },
  { key: 'whatsapp', label: 'WhatsApp number', hint: 'international format, e.g. 254797528174' },
  { key: 'instagram', label: 'Instagram handle', hint: 'without the @' },
  { key: 'tiktok', label: 'TikTok handle', hint: 'without the @' },
  { key: 'deliveryNote', label: 'Delivery note', textarea: true },
  { key: 'noticeHours', label: 'Order notice (hours)', type: 'number' },
  { key: 'depositRate', label: 'Minimum deposit', hint: '0.5 = 50% up front', type: 'number', step: '0.05' },
]

export default function BusinessEditor() {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getBusiness()
      .then((b) => { setForm(b); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const patch = {}
      for (const key of EDITABLE_FIELDS) patch[key] = form[key]
      patch.noticeHours = Math.max(0, Number(patch.noticeHours) || 0)
      // Keep the deposit sane: between 10% and 100%.
      patch.depositRate = Math.min(1, Math.max(0.1, Number(patch.depositRate) || 0.5))
      await saveBusiness(patch)
      setForm((f) => ({ ...f, ...patch }))
      setSaved(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return (
      <div className="admin-panel">
        <div className="confirm"><div className="spinner" /><p style={{ color: 'var(--muted)' }}>Loading…</p></div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <div className="admin-head">
        <div>
          <div className="eyebrow">Your details</div>
          <h2>Business details</h2>
        </div>
      </div>

      <form className="biz-form" onSubmit={save}>
        <div className="biz-grid">
          {FIELDS.map((f) => (
            <div className={`field ${f.textarea ? 'biz-wide' : ''}`} key={f.key}>
              <label>{f.label} {f.hint && <span className="hint">{f.hint}</span>}</label>
              {f.textarea ? (
                <textarea className="textarea" value={form[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)} />
              ) : (
                <input className="input" type={f.type || 'text'} step={f.step}
                  value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>

        {error && <p className="login-error">{error}</p>}

        <div className="biz-foot">
          {saved && <span className="saved-note">✓ Saved</span>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>
    </div>
  )
}
