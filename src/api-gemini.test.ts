import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/gemini'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GEMINI_API_KEY', 'AIzaSECRET')
  vi.stubEnv('GEMINI_BASE_URL', 'https://upstream.test')
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function run(over: { method?: string; path?: string[]; origin?: string; host?: string; body?: unknown } = {}) {
  const out = { status: 0, headers: {} as Record<string, string>, body: '' }
  const res = {
    status(c: number) {
      out.status = c
      return res
    },
    setHeader(k: string, v: string) {
      out.headers[k] = v
      return res
    },
    send(b: string) {
      out.body = b
    },
  }
  const headers: Record<string, string> = { host: over.host ?? 'barengin.vercel.app' }
  if (over.origin !== undefined) headers.origin = over.origin
  return handler(
    {
      method: over.method ?? 'POST',
      headers,
      query: { path: over.path ?? ['v1beta', 'models', 'gemini-3.6-flash:generateContent'] },
      body: over.body ?? { contents: [] },
    },
    res,
  ).then(() => out)
}

describe('api/gemini proxy', () => {
  it('path sebagai string (hasil rewrite vercel.json) juga dikenali', async () => {
    const out = { status: 0, body: '' }
    const res = {
      status(c: number) {
        out.status = c
        return res
      },
      setHeader() {
        return res
      },
      send(b: string) {
        out.body = b
      },
    }
    await handler(
      { method: 'POST', headers: { host: 'x.vercel.app' }, query: { path: 'v1beta/models/gemini-2.5-flash:generateContent' }, body: {} },
      res,
    )
    expect(out.status).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toBe('https://upstream.test/v1beta/models/gemini-2.5-flash:generateContent')
  })

  it('GET /api/gemini (tanpa path) = cek kesehatan tanpa membocorkan key', async () => {
    const out = await run({ method: 'GET', path: [] })
    expect(out.status).toBe(200)
    expect(JSON.parse(out.body)).toEqual({ ok: true, proxy: 'barengin', keyConfigured: true })
    expect(out.body).not.toContain('AIzaSECRET')
    vi.stubEnv('GEMINI_API_KEY', '')
    expect(JSON.parse((await run({ method: 'GET', path: [] })).body).keyConfigured).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('galat dari proxy ditandai proxy:true', async () => {
    const out = await run({ origin: 'https://evil.example' })
    expect(JSON.parse(out.body).proxy).toBe(true)
  })

  it('meneruskan ke Google dengan key di header dan mengembalikan status + isi asli', async () => {
    const out = await run({ origin: 'https://barengin.vercel.app' })
    expect(out.status).toBe(200)
    expect(out.body).toBe('{"ok":true}')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://upstream.test/v1beta/models/gemini-3.6-flash:generateContent')
    expect(init.headers['x-goog-api-key']).toBe('AIzaSECRET')
    expect(JSON.parse(init.body)).toEqual({ contents: [] })
  })

  it('meneruskan 429 apa adanya (klien butuh retryDelay) dan 404 (fallback model)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"details":[{"retryDelay":"7s"}]}}', { status: 429 }))
    expect((await run()).status).toBe(429)
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }))
    expect((await run()).status).toBe(404)
  })

  it('menolak selain POST, path di luar generateContent, dan origin lain', async () => {
    expect((await run({ method: 'PUT' })).status).toBe(405)
    expect((await run({ method: 'GET', path: ['v1beta', 'files'] })).status).toBe(404) // GET hanya untuk daftar model
    expect((await run({ method: 'POST', path: ['v1beta', 'models'] })).status).toBe(404)
    expect((await run({ path: ['v1beta', 'models'] })).status).toBe(404)
    expect((await run({ path: ['v1beta', 'files', 'x'] })).status).toBe(404)
    expect((await run({ path: ['..', 'admin:generateContent'] })).status).toBe(404)
    expect((await run({ origin: 'https://evil.example' })).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('GET v1beta/models: meneruskan daftar model dengan query dipatok dan key di header', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"models":[]}', { status: 200 }))
    const out = await run({ method: 'GET', path: ['v1beta', 'models'], origin: 'https://barengin.vercel.app' })
    expect(out.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://upstream.test/v1beta/models?pageSize=200')
    expect(init.headers['x-goog-api-key']).toBe('AIzaSECRET')
    expect(init.method).toBeUndefined() // GET
  })

  it('403 dengan pesan jelas bila key server belum diatur', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const out = await run()
    expect(out.status).toBe(403)
    expect(out.body).toContain('GEMINI_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tidak pernah membocorkan key ke respons', async () => {
    const out = await run()
    expect(out.body).not.toContain('AIzaSECRET')
    expect(JSON.stringify(out.headers)).not.toContain('AIzaSECRET')
  })
})
