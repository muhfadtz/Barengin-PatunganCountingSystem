/**
 * Proxy Gemini untuk produksi (Vercel). Di dev, peran yang sama dipegang proxy di vite.config.ts.
 * API key hanya ada di Environment Variable server `GEMINI_API_KEY`, tidak pernah dikirim ke browser.
 *
 * Browser memanggil `/api/gemini/<path>`; `vercel.json` me-rewrite ke fungsi ini dengan `?path=<path>`.
 * `GET /api/gemini` (tanpa path) = cek kesehatan: memastikan fungsi hidup dan apakah key sudah diatur (key tidak ditampilkan).
 *
 * Dibatasi seketat mungkin supaya key tidak bisa dipakai untuk hal lain, hanya dari origin yang sama:
 * - POST `v1beta/models/<model>:generateContent` (membaca struk)
 * - GET  `v1beta/models` (daftar model yang tersedia untuk key ini; query dipatok, tidak diteruskan dari klien)
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

const GENERATE_PATH = /^v1beta\/models\/[A-Za-z0-9._-]+:generateContent$/
const LIST_PATH = 'v1beta/models'

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** Galat dari proxy ini ditandai `proxy: true` agar klien bisa membedakannya dari galat Google atau 404 hosting. */
function fail(res: Res, status: number, message: string) {
  res
    .status(status)
    .setHeader('content-type', 'application/json')
    .send(JSON.stringify({ proxy: true, error: { message, status: 'BARENGIN_PROXY' } }))
}

export default async function handler(req: Req, res: Res) {
  const segments = req.query.path
  const path = (Array.isArray(segments) ? segments.join('/') : (segments ?? '')).replace(/^\/+|\/+$/g, '')

  if (req.method === 'GET' && path === '') {
    const configured = (process.env.GEMINI_API_KEY ?? '').trim() !== ''
    return void res.status(200).setHeader('content-type', 'application/json').send(JSON.stringify({ ok: true, proxy: 'barengin', keyConfigured: configured }))
  }

  const isGenerate = req.method === 'POST' && GENERATE_PATH.test(path)
  const isList = req.method === 'GET' && path === LIST_PATH
  if (!isGenerate && !isList) return fail(res, req.method === 'POST' || req.method === 'GET' ? 404 : 405, 'Not found')

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
    upstream = isList
      ? await fetch(`${base}/${path}?pageSize=200`, { headers: { 'x-goog-api-key': key } })
      : await fetch(`${base}/${path}`, {
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
