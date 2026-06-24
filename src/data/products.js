// Rolling Pin menu — now lives in the shared backend so edits from the admin show
// up on every device. The storefront reads it; the admin Menu manager writes it.
// Product shape: { id, name, category, emoji, tag, blurb, art, price, image, weight, soldOut, sort }

import { authFetch } from './auth.js'

const API = import.meta.env.VITE_API_URL || ''

// Photos saved on disk (file-store mode) come back as "/uploads/xxx". Prefix them
// with the API origin if the frontend is served elsewhere. Full URLs (Supabase
// Storage) and data URLs pass straight through.
export function imageUrl(src) {
  if (!src) return ''
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src
  return `${API}${src}`
}

async function jsonOrThrow(r, fallback) {
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || fallback)
  return data
}

export async function getProducts() {
  const r = await fetch(`${API}/api/products`)
  return jsonOrThrow(r, 'Could not load the menu.')
}

export async function getProduct(id) {
  const products = await getProducts()
  return products.find((p) => p.id === id) || null
}

// Build the category chips from whatever the live menu actually contains.
export function categoriesFrom(products) {
  const cats = []
  for (const p of products) {
    if (p.category && !cats.includes(p.category)) cats.push(p.category)
  }
  return ['All', ...cats]
}

function announce() {
  window.dispatchEvent(new Event('products-updated'))
}

export async function createProduct(patch) {
  const r = await authFetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const product = await jsonOrThrow(r, 'Could not add the product.')
  announce()
  return product
}

export async function updateProduct(id, patch) {
  const r = await authFetch(`/api/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const product = await jsonOrThrow(r, 'Could not save the product.')
  announce()
  return product
}

export async function deleteProduct(id) {
  const r = await authFetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!r.ok && r.status !== 204) {
    const data = await r.json().catch(() => ({}))
    throw new Error(data.error || 'Could not delete the product.')
  }
  announce()
}

// Shrink a chosen photo in the browser (so we never upload a 5MB phone snap),
// then send it to the server, which stores it and returns a public URL.
export async function uploadProductImage(file) {
  const dataUrl = await downscale(file)
  const r = await authFetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  })
  const data = await jsonOrThrow(r, 'Could not upload the photo.')
  return data.url
}

function downscale(file, max = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not a valid image.'))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
