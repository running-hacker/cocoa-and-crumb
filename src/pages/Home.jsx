import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getProducts, categoriesFrom, imageUrl } from '../data/products.js'
import { BUSINESS, formatPrice } from '../data/business.js'

export default function Home() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('All')

  useEffect(() => {
    let alive = true
    const load = () => {
      getProducts()
        .then((list) => { if (alive) { setProducts(list); setLoading(false) } })
        .catch(() => { if (alive) setLoading(false) })
    }
    load()
    // Refresh instantly if the admin edits the menu in another tab/device.
    window.addEventListener('products-updated', load)
    return () => { alive = false; window.removeEventListener('products-updated', load) }
  }, [])

  const categories = categoriesFrom(products)
  const list = category === 'All' ? products : products.filter((p) => p.category === category)
  const sampleWeight = products[0]?.weight || '800g'

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">{BUSINESS.tagline} · {BUSINESS.location}</div>
            <h1>
              Baked for slow mornings &amp; <em>afternoon chai</em>.
            </h1>
            <p className="lead">
              Artisan tea cakes from our Nairobi kitchen — marble, banana bread, lemon,
              chocolate and more. Freshly baked to order and delivered to your door.
            </p>
            <div className="hero-cta">
              <Link to="/order" className="btn btn-primary">Order a cake →</Link>
              <a href="#menu" className="btn btn-ghost">See the menu</a>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <strong>{products.length || '6'}</strong>
                <span>Tea cakes</span>
              </div>
              <div className="stat">
                <strong>{sampleWeight}</strong>
                <span>Every loaf</span>
              </div>
              <div className="stat">
                <strong>{BUSINESS.noticeHours}h</strong>
                <span>Order notice</span>
              </div>
            </div>
          </div>
          <div className="hero-art">
            <span className="cake-emoji">🍰</span>
            <div className="hero-badge">
              <span className="dot" />
              <span>
                <small>Freshly baked &amp; delivered across</small>
                <strong>Nairobi</strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="menu">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">Our menu</div>
            <h2>Freshly baked tea cakes</h2>
            <p>Made to order, baked fresh. Pick your favourite, choose how many,
              and tell us when you need it.</p>
          </div>

          {categories.length > 1 && (
            <div className="chips">
              {categories.map((c) => (
                <button
                  key={c}
                  className={`chip ${category === c ? 'active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <p className="menu-empty">Loading the menu…</p>
          ) : list.length === 0 ? (
            <p className="menu-empty">Our menu is being updated — check back soon.</p>
          ) : (
            <div className="menu-grid">
              {list.map((p) => {
                const art = (
                  <div className="card-art" style={{ background: p.art }}>
                    {p.tag && <span className="tag">{p.tag}</span>}
                    {p.soldOut && <span className="tag tag-sold">Sold out</span>}
                    {p.image
                      ? <img src={imageUrl(p.image)} alt={p.name} className="card-img" loading="lazy" />
                      : <span>{p.emoji}</span>}
                  </div>
                )
                const body = (
                  <div className="card-body">
                    <h3>{p.name}</h3>
                    <p>{p.blurb}</p>
                    <div className="card-foot">
                      <span className="price">
                        {formatPrice(p.price)} <small>/ {p.weight}</small>
                      </span>
                      <span className="btn btn-ghost" style={{ padding: '9px 18px', fontSize: '0.85rem' }}>
                        {p.soldOut ? 'Sold out' : 'Order'}
                      </span>
                    </div>
                  </div>
                )
                return p.soldOut ? (
                  <div className="card is-sold" key={p.id}>{art}{body}</div>
                ) : (
                  <Link to={`/order/${p.id}`} className="card" key={p.id}>{art}{body}</Link>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
