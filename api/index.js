// Vercel serverless entry point for the whole API.
//
// On a cold start this imports the Express app — which registers every /api/* route
// and resolves the Supabase-backed data store — and then hands each incoming request
// to it. The app skips `app.listen` on Vercel (see the VERCEL guard in
// server/index.js), so the same code runs both as a normal server locally and as a
// serverless function here.
import app from '../server/index.js'

export default app
