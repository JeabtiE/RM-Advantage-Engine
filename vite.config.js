import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tailwind v4 runs as a Vite plugin — no tailwind.config.js / postcss.config.js needed

// devApiPlugin — serve the /api functions through the Vite dev server.
//
// WHY: api/*.js are Vercel serverless functions. In production Vercel routes
// /api/* to them; the Vite dev server knows nothing about /api and would 404, so
// live mode + the agent pipeline would only ever work on a deploy. This mounts
// the same handlers locally so `npm run dev` exercises the real code path.
//
// Two endpoints are routed:
//   /api/fetch-live-news  — Yahoo RSS proxy (GET, reads req.query).
//   /api/claude-agent     — unified 3-agent endpoint (POST, reads req.body).
//
// DEV ONLY — configureServer never runs during `vite build`, so this adds
// nothing to the production bundle and cannot affect the demo.

// Read a request body to completion, then JSON.parse it. claude-agent is POST
// with a JSON body; the Vercel runtime parses that into req.body for us, so the
// dev shim must do the same or the handler sees no payload.
function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        // Hand the handler the raw string; its own body guard will try to parse
        // and return a 400 rather than the shim swallowing the error.
        resolve(raw)
      }
    })
    req.on('error', () => resolve(undefined))
  })
}

// One shim factory for both endpoints. modulePath is the /api file to load;
// errorShape is what to answer if loading/dispatching the handler itself throws
// (each endpoint has its own catch-all, so this only covers the rare load fault)
// — matched to that endpoint's response shape so callers never see a stray body.
function mountApiHandler(server, route, modulePath, errorShape) {
  server.middlewares.use(route, async (req, res) => {
    // ssrLoadModule (not a static import) so edits to the handler hot-reload
    // without restarting the dev server.
    const mod = await server.ssrLoadModule(modulePath)
    const handler = mod.default

    // Minimal shim for the Vercel req/res surface the handlers actually use:
    // req.method, req.query, req.body, res.status().json(), res.setHeader().
    const url = new URL(req.url ?? '/', 'http://localhost')
    const shimReq = {
      method: req.method,
      query: Object.fromEntries(url.searchParams),
      body: req.method === 'POST' ? await readJsonBody(req) : undefined,
    }
    const shimRes = {
      setHeader: (k, v) => { res.setHeader(k, v); return shimRes },
      status: (code) => { res.statusCode = code; return shimRes },
      json: (body) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(body))
        return shimRes
      },
    }

    try {
      await handler(shimReq, shimRes)
    } catch (err) {
      // The handler has its own catch-all; this only covers a failure to load or
      // dispatch it, and still answers in the endpoint's shape.
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ...errorShape, error: String(err?.message ?? err) }))
    }
  })
}

function devApiPlugin() {
  return {
    name: 'dev-api',
    configureServer(server) {
      mountApiHandler(
        server,
        '/api/fetch-live-news',
        '/api/fetch-live-news.js',
        { ok: false, items: [] },
      )
      mountApiHandler(
        server,
        '/api/claude-agent',
        '/api/claude-agent.js',
        {},
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApiPlugin()],
})
