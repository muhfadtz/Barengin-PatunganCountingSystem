/**
 * Proxy Gemini untuk produksi (Vercel). Di dev, peran yang sama dipegang proxy di vite.config.ts.
 * API key hanya ada di Environment Variable server `GEMINI_API_KEY`, tidak pernah dikirim ke browser.
 *
 * Dibatasi seketat mungkin supaya key tidak bisa dipakai untuk hal lain:
 * hanya POST, hanya `v1beta/models/<model>:generateContent`, dan hanya dari origin yang sama.
 */

declare const process: { env: Record<string, string | undefined> }

interface Req {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string | string[] | undefined>
  body?: unknown
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): Res
  send(body: string): void
}

const ALLOWED_PATH = /^v1beta\/models\/[A-Za-z0-9._-]+:generateContent$/

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

function fail(res: Res, status: number, message: string) {
  res.status(status).setHeader('content-type', 'application/json').send(JSON.stringify({ error: { message } }))
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

  const segments = req.query.path
  const path = Array.isArray(segments) ? segments.join('/') : (segments ?? '')
  if (!ALLOWED_PATH.test(path)) return fail(res, 404, 'Not found')

  // Browser selalu menyertakan Origin pada POST; tolak bila bukan dari situs ini.
  const origin = first(req.headers.origin)
  const host = first(req.headers['x-forwarded-host']) ?? first(req.headers.host)
  if (origin) {
    let originHost = ''
    try {
      originHost = new URL(origin).host
    } catch {
      /* origin tidak valid */
    }
    if (originHost !== host) return fail(res, 403, 'Origin tidak diizinkan')
  }

  const key = (process.env.GEMINI_API_KEY ?? '').trim()
  if (!key) return fail(res, 403, 'GEMINI_API_KEY belum diatur di server')

  const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
  let upstream: Response
  try {
    upstream = await fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
    })
  } catch {
    return fail(res, 502, 'Tidak bisa menghubungi Gemini')
  }

  // Teruskan status & isi apa adanya (klien membaca 429/retryDelay dan 404 untuk fallback model).
  res
    .status(upstream.status)
    .setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')
    .send(await upstream.text())
}
