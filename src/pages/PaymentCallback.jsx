import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { verifyPayment } from '../data/payments.js'
import { BUSINESS } from '../data/business.js'

export default function PaymentCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    // Guard against React's double-invoke so we never verify twice.
    if (ran.current) return
    ran.current = true

    const reference = params.get('reference') || params.get('trxref')

    if (!reference) {
      setError(
        'We could not match your payment to an order. If you were charged, please send ' +
          `${BUSINESS.name} a message and we will sort it out right away.`,
      )
      return
    }

    // The server verifies with Paystack and, on success, creates the order from the
    // transaction's own metadata — so it hands us back the finished order.
    verifyPayment(reference)
      .then((res) => {
        if (!res.paid || !res.order) {
          setError('Your payment was not completed. Nothing was charged — you can try again.')
          return
        }
        navigate(`/confirmation/${res.order.code}`, { replace: true })
      })
      .catch((err) => setError(err.message))
  }, [navigate, params])

  return (
    <section className="section">
      <div className="container confirm">
        {error ? (
          <>
            <h2>Payment didn&apos;t go through</h2>
            <p style={{ color: 'var(--muted)' }}>{error}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
              <Link to="/order" className="btn btn-primary">Try again</Link>
              <a href={`https://wa.me/${BUSINESS.whatsapp}`} target="_blank" rel="noreferrer" className="btn btn-ghost">
                Message {BUSINESS.name}
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="spinner" />
            <h2>Confirming your payment…</h2>
            <p style={{ color: 'var(--muted)' }}>One moment — please don&apos;t close this page.</p>
          </>
        )}
      </div>
    </section>
  )
}
