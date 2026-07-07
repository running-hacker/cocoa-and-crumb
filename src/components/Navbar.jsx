import { NavLink, Link } from 'react-router-dom'
import { BUSINESS } from '../data/business.js'

export default function Navbar() {
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">RP</span>
          <span className="brand-name">{BUSINESS.name}</span>
        </Link>
        <div className="nav-links">
          <NavLink to="/" end>Menu</NavLink>
          <NavLink to="/track">Track order</NavLink>
          <Link to="/order" className="btn btn-primary">
            Order now
          </Link>
        </div>
      </div>
    </nav>
  )
}
