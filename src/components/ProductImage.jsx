import { useState, useRef, useLayoutEffect } from 'react'
import { imageUrl } from '../data/products.js'

// A product photo that never flashes a placeholder on refresh.
//
// On refresh the photo is usually already in the browser cache, so we check
// img.complete in a *layout* effect (which runs before the browser paints): a cached
// image is marked loaded on the very first frame and renders fully opaque — no gradient,
// no emoji, no flash. A genuinely cold image fades in the instant it finishes loading.
// Loads eagerly (no lazy defer) since the menu is only a handful of photos.
export default function ProductImage({ image, alt = '', className = '' }) {
  const [loaded, setLoaded] = useState(false)
  const ref = useRef(null)

  useLayoutEffect(() => {
    const img = ref.current
    setLoaded(Boolean(img && img.complete && img.naturalWidth > 0))
  }, [image])

  return (
    <img
      ref={ref}
      src={imageUrl(image)}
      alt={alt}
      decoding="async"
      className={`product-img ${className} ${loaded ? 'is-loaded' : ''}`}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
    />
  )
}
