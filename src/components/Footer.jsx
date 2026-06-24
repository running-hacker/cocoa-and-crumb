import { Link } from 'react-router-dom'
import { BUSINESS } from '../data/business.js'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h4>{BUSINESS.name}</h4>
            <p>{BUSINESS.speciality} Freshly baked in {BUSINESS.location} and delivered to your door.</p>
          </div>
          <div>
            <h4>Order</h4>
            <Link to="/">Menu</Link>
            <Link to="/order">Place an order</Link>
            <Link to="/track">Track your order</Link>
          </div>
          <div>
            <h4>Say hello</h4>
            <a href={`https://wa.me/${BUSINESS.whatsapp}`} target="_blank" rel="noreferrer">
              WhatsApp · {BUSINESS.phone}
            </a>
            <a href={`https://instagram.com/${BUSINESS.instagram}`} target="_blank" rel="noreferrer">
              Instagram · @{BUSINESS.instagram}
            </a>
            <a href={`https://tiktok.com/@${BUSINESS.tiktok}`} target="_blank" rel="noreferrer">
              TikTok · @{BUSINESS.tiktok}
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          Freshly baked to order · {BUSINESS.noticeHours} hours notice · © {new Date().getFullYear()} {BUSINESS.name}, {BUSINESS.location}
        </div>
      </div>
    </footer>
  )
}
