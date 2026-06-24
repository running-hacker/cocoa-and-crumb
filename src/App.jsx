import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import Order from './pages/Order.jsx'
import Confirmation from './pages/Confirmation.jsx'
import PaymentCallback from './pages/PaymentCallback.jsx'
import Track from './pages/Track.jsx'
import Admin from './pages/Admin.jsx'
import AdminLogin from './pages/AdminLogin.jsx'
import { loadBusinessConfig } from './data/business.js'

export default function App() {
  const { pathname } = useLocation()
  const [, setTick] = useState(0)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // Pull live business details from the backend on start, and re-render the whole
  // app (Navbar/Footer/pages read BUSINESS directly) whenever the admin edits them.
  useEffect(() => {
    const rerender = () => setTick((n) => n + 1)
    loadBusinessConfig().then(rerender)
    window.addEventListener('business-updated', rerender)
    return () => window.removeEventListener('business-updated', rerender)
  }, [])

  const isAdmin = pathname.startsWith('/admin')

  return (
    <>
      {!isAdmin && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/order" element={<Order />} />
          <Route path="/order/:productId" element={<Order />} />
          <Route path="/confirmation/:code" element={<Confirmation />} />
          <Route path="/payment/callback" element={<PaymentCallback />} />
          <Route path="/track" element={<Track />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
      {!isAdmin && <Footer />}
    </>
  )
}
