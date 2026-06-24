import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getDeliveryZones,
  addDeliveryZone,
  editDeliveryZone,
  removeDeliveryZone,
} from '../../data/delivery.js'
import { formatPrice } from '../../data/business.js'

const BLANK = { route: '', area: '', fee: '' }

export default function DeliveryManager() {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(null) // null = closed, else the add draft
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(BLANK)

  const refresh = useCallback(async () => {
    try {
      setZones(await getDeliveryZones())
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Existing routes, in first-seen order — used for the datalist and the grouping.
  const routes = useMemo(() => {
    const seen = []
    for (const z of zones) if (!seen.includes(z.route)) seen.push(z.route)
    return seen
  }, [zones])

  const grouped = useMemo(
    () => routes.map((route) => ({ route, items: zones.filter((z) => z.route === route) })),
    [zones, routes],
  )

  function startAdd() {
    setError('')
    setEditingId(null)
    setAdding({ ...BLANK, route: routes[0] || '' })
  }
  function startEdit(z) {
    setError('')
    setAdding(null)
    setEditingId(z.id)
    setDraft({ route: z.route, area: z.area, fee: String(z.fee) })
  }
  function cancel() {
    setAdding(null)
    setEditingId(null)
    setError('')
  }

  async function submitAdd(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await addDeliveryZone({ route: adding.route, area: adding.area, fee: Number(adding.fee) })
      setAdding(null)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitEdit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await editDeliveryZone(editingId, { route: draft.route, area: draft.area, fee: Number(draft.fee) })
      setEditingId(null)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(z) {
    if (!confirm(`Remove “${z.area}” (${z.route}) from delivery areas?`)) return
    setError('')
    try {
      await removeDeliveryZone(z.id)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-head">
        <div>
          <div className="eyebrow">Storefront</div>
          <h2>Delivery areas</h2>
        </div>
        <button className="btn btn-primary" onClick={startAdd}>+ Add area</button>
      </div>

      <p style={{ color: 'var(--muted)', margin: '0 0 18px', fontSize: '0.9rem' }}>
        The fee customers pay by area, grouped by route. Changes go live on the order page right away.
      </p>

      {error && <p className="empty" style={{ color: 'var(--berry)' }}>{error}</p>}

      {adding && (
        <form className="dz-addbar" onSubmit={submitAdd}>
          <input className="input" list="dz-routes" placeholder="Route (e.g. Ngong Road)" autoFocus
            value={adding.route} onChange={(e) => setAdding((a) => ({ ...a, route: e.target.value }))} />
          <input className="input" placeholder="Area / estate"
            value={adding.area} onChange={(e) => setAdding((a) => ({ ...a, area: e.target.value }))} />
          <input className="input" type="number" min="0" placeholder="Fee (KSH)"
            value={adding.fee} onChange={(e) => setAdding((a) => ({ ...a, fee: e.target.value }))} />
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
          <button type="button" className="btn btn-ghost" onClick={cancel}>Cancel</button>
        </form>
      )}

      <datalist id="dz-routes">
        {routes.map((r) => <option key={r} value={r} />)}
      </datalist>

      {loading ? (
        <div className="confirm"><div className="spinner" /><p style={{ color: 'var(--muted)' }}>Loading delivery areas…</p></div>
      ) : zones.length === 0 ? (
        <p className="empty">No delivery areas yet. Click “Add area” to start.</p>
      ) : (
        grouped.map((g) => (
          <div className="dz-group" key={g.route}>
            <div className="dz-route">{g.route}<span>{g.items.length}</span></div>
            {g.items.map((z) => (
              <div className="dz-row" key={z.id}>
                {editingId === z.id ? (
                  <form className="dz-edit" onSubmit={submitEdit}>
                    <input className="input" list="dz-routes" value={draft.route}
                      onChange={(e) => setDraft((d) => ({ ...d, route: e.target.value }))} />
                    <input className="input" value={draft.area}
                      onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))} />
                    <input className="input" type="number" min="0" value={draft.fee}
                      onChange={(e) => setDraft((d) => ({ ...d, fee: e.target.value }))} />
                    <button type="submit" className="mini-btn" disabled={busy}>Save</button>
                    <button type="button" className="mini-btn" onClick={cancel}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span className="dz-area">{z.area}</span>
                    <span className="dz-fee">{formatPrice(z.fee)}</span>
                    <button className="mini-btn" onClick={() => startEdit(z)}>Edit</button>
                    <button className="mini-btn danger" onClick={() => remove(z)}>Delete</button>
                  </>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
