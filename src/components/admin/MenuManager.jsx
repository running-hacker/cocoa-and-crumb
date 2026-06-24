import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  imageUrl,
} from '../../data/products.js'
import { formatPrice } from '../../data/business.js'

const BLANK = {
  name: '',
  category: 'Cakes',
  price: 800,
  weight: '800g',
  emoji: '🍰',
  tag: '',
  blurb: '',
  image: null,
  soldOut: false,
  art: 'linear-gradient(160deg, #ecdcc2, #c9a376)',
}

export default function MenuManager() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null = closed, else the form draft
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      setProducts(await getProducts())
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const startAdd = () => { setError(''); setEditing({ ...BLANK }) }
  const startEdit = (p) => { setError(''); setEditing({ ...p, tag: p.tag || '' }) }
  const cancel = () => { setEditing(null); setError('') }
  const setField = (key, value) => setEditing((d) => ({ ...d, [key]: value }))

  async function onPickPhoto(file) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const url = await uploadProductImage(file)
      setField('image', url)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save(e) {
    e.preventDefault()
    if (!editing.name.trim()) { setError('Please give the cake a name.'); return }
    const price = Number(editing.price)
    if (!Number.isFinite(price) || price <= 0) { setError('Please set a price greater than 0.'); return }
    setSaving(true)
    setError('')
    try {
      const patch = {
        ...editing,
        name: editing.name.trim(),
        price,
        category: editing.category.trim() || 'Cakes',
      }
      if (editing.id) await updateProduct(editing.id, patch)
      else await createProduct(patch)
      setEditing(null)
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(p) {
    if (!confirm(`Delete “${p.name}” from the menu? This can't be undone.`)) return
    setError('')
    try {
      await deleteProduct(p.id)
      await refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  async function toggleSold(p) {
    setError('')
    try {
      await updateProduct(p.id, { soldOut: !p.soldOut })
      await refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-head">
        <div>
          <div className="eyebrow">Your menu</div>
          <h2>Cakes &amp; products</h2>
        </div>
        <button className="btn btn-primary" onClick={startAdd}>+ Add a cake</button>
      </div>

      {error && <p className="empty" style={{ color: 'var(--berry)' }}>{error}</p>}

      {loading ? (
        <div className="confirm"><div className="spinner" /><p style={{ color: 'var(--muted)' }}>Loading the menu…</p></div>
      ) : products.length === 0 ? (
        <p className="empty">No cakes yet. Click “Add a cake” to start your menu.</p>
      ) : (
        <div className="pm-grid">
          {products.map((p) => (
            <div className={`pm-card ${p.soldOut ? 'is-sold' : ''}`} key={p.id}>
              <div className="pm-thumb" style={{ background: p.art }}>
                {p.image
                  ? <img src={imageUrl(p.image)} alt={p.name} />
                  : <span>{p.emoji}</span>}
                {p.tag && <span className="pm-tag">{p.tag}</span>}
              </div>
              <div className="pm-body">
                <div className="pm-row">
                  <h4>{p.name}</h4>
                  <span className="pm-price">{formatPrice(p.price)}</span>
                </div>
                <p className="pm-meta">{p.category} · {p.weight}</p>
                {p.blurb && <p className="pm-blurb">{p.blurb}</p>}
                <div className="pm-actions">
                  <button className="mini-btn" onClick={() => startEdit(p)}>Edit</button>
                  <button className="mini-btn" onClick={() => toggleSold(p)}>
                    {p.soldOut ? 'Mark available' : 'Mark sold out'}
                  </button>
                  <button className="mini-btn danger" onClick={() => remove(p)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="admin-modal" onClick={cancel}>
          <form className="admin-dialog" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="dialog-head">
              <h3>{editing.id ? 'Edit cake' : 'Add a cake'}</h3>
              <button type="button" className="dialog-x" onClick={cancel}>✕</button>
            </div>

            <div className="dialog-body">
              <div className="photo-field">
                <div className="photo-preview" style={{ background: editing.art }}>
                  {editing.image
                    ? <img src={imageUrl(editing.image)} alt="" />
                    : <span>{editing.emoji || '🍰'}</span>}
                </div>
                <div className="photo-controls">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => onPickPhoto(e.target.files?.[0])}
                  />
                  <button type="button" className="btn btn-ghost" disabled={uploading}
                    onClick={() => fileRef.current?.click()}>
                    {uploading ? 'Uploading…' : editing.image ? 'Replace photo' : 'Upload photo'}
                  </button>
                  {editing.image && (
                    <button type="button" className="mini-btn" onClick={() => setField('image', null)}>
                      Remove photo
                    </button>
                  )}
                  <p className="photo-hint">A real photo makes the cake far more tempting. No photo? The emoji is used instead.</p>
                </div>
              </div>

              <div className="field">
                <label>Name</label>
                <input className="input" value={editing.name}
                  placeholder="e.g. Marble Cake" onChange={(e) => setField('name', e.target.value)} />
              </div>

              <div className="dialog-grid">
                <div className="field">
                  <label>Price <span className="hint">KSH</span></label>
                  <input className="input" type="number" min="0" value={editing.price}
                    onChange={(e) => setField('price', e.target.value)} />
                </div>
                <div className="field">
                  <label>Weight</label>
                  <input className="input" value={editing.weight}
                    placeholder="800g" onChange={(e) => setField('weight', e.target.value)} />
                </div>
              </div>

              <div className="dialog-grid">
                <div className="field">
                  <label>Category</label>
                  <input className="input" value={editing.category}
                    placeholder="Cakes" onChange={(e) => setField('category', e.target.value)} />
                </div>
                <div className="field">
                  <label>Emoji <span className="hint">fallback icon</span></label>
                  <input className="input" value={editing.emoji} maxLength={4}
                    placeholder="🍰" onChange={(e) => setField('emoji', e.target.value)} />
                </div>
              </div>

              <div className="field">
                <label>Tag <span className="hint">optional badge, e.g. Bestseller</span></label>
                <input className="input" value={editing.tag}
                  placeholder="Bestseller" onChange={(e) => setField('tag', e.target.value)} />
              </div>

              <div className="field">
                <label>Description</label>
                <textarea className="textarea" value={editing.blurb}
                  placeholder="A short, mouth-watering description."
                  onChange={(e) => setField('blurb', e.target.value)} />
              </div>

              <label className="check-row">
                <input type="checkbox" checked={editing.soldOut}
                  onChange={(e) => setField('soldOut', e.target.checked)} />
                <span>Sold out (hide from ordering)</span>
              </label>

              {error && <p className="login-error">{error}</p>}
            </div>

            <div className="dialog-foot">
              <button type="button" className="btn btn-ghost" onClick={cancel}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
                {saving ? 'Saving…' : editing.id ? 'Save changes' : 'Add to menu'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
