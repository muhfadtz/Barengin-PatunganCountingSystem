/**
 * OCR struk memakai baidu/Unlimited-OCR lewat Hugging Face Space resminya (ZeroGPU, API Gradio).
 * Memakai kuota ZeroGPU akun HF pemilik token.
 *
 * Browser memanggil `/api/ocr/...` di server Vite; proxy-nya (lihat vite.config.ts) menambahkan token HF
 * dan meneruskan ke Space. Token TIDAK pernah dikirim ke browser / bundle.
 *
 * Alur API Gradio: upload file → POST /call/run_ocr (dapat event_id) → GET /call/run_ocr/{event_id} (SSE).
 */

const BASE = '/api/ocr/gradio_api'
const MODE = 'gundam' // 'gundam' (cepat, crop 640px) atau 'base' (lebih teliti, 1024px)
const PROMPT = 'document parsing.'

export class OcrError extends Error {
  constructor(
    message: string,
    readonly fatal = false,
  ) {
    super(message)
  }
}

/** Perkecil foto (maks 1600px) agar upload ringan; kembalikan Blob JPEG. */
async function toJpegBlob(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.9),
  )
}

function httpError(res: Response): OcrError {
  if (res.status === 404 || res.status === 405)
    return new OcrError('Space OCR tidak ditemukan. Isi HF_TOKEN di .env dan periksa UNLIMITED_OCR_URL, lalu restart server.', true)
  if (res.status === 401 || res.status === 403)
    return new OcrError('Token Hugging Face ditolak. Periksa HF_TOKEN di .env.', true)
  if (res.status === 429) return new OcrError('Kuota ZeroGPU habis atau terlalu banyak antrian. Coba lagi nanti.')
  if (res.status >= 502 && res.status <= 504)
    return new OcrError('Space sedang tidur atau sibuk. Tunggu sebentar lalu coba lagi.')
  return new OcrError(`Server OCR error (${res.status})`)
}

/** Ambil hasil akhir dari aliran SSE Gradio: event `complete` (atau data terakhir), `error` → lempar. */
export function parseSse(raw: string): string {
  let event = ''
  let last: unknown = null
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) {
      const payload = line.slice(5).trim()
      if (event === 'error') throw new OcrError('Space OCR gagal memproses gambar (kemungkinan kuota ZeroGPU habis).')
      if (!payload || payload === 'null') continue
      try {
        last = JSON.parse(payload)
      } catch {
        /* baris data bukan JSON: abaikan */
      }
    }
  }
  const first = Array.isArray(last) ? last[0] : last
  const text = typeof first === 'string' ? first : (first as { text?: unknown } | null)?.text
  if (typeof text !== 'string') throw new OcrError('OCR tidak mengembalikan teks')
  return text
}

/** Kirim satu foto ke Unlimited-OCR dan kembalikan teks/markdown hasil OCR. */
export async function recognizeReceipt(file: File): Promise<string> {
  const blob = await toJpegBlob(file).catch(() => {
    throw new OcrError('Gambar tidak bisa dibuka')
  })

  try {
    const form = new FormData()
    form.append('files', blob, 'receipt.jpg')
    const up = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
    if (!up.ok) throw httpError(up)
    const paths = (await up.json()) as string[]
    if (!Array.isArray(paths) || !paths[0]) throw new OcrError('Upload ke Space gagal')

    const call = await fetch(`${BASE}/call/run_ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{ path: paths[0], orig_name: 'receipt.jpg', meta: { _type: 'gradio.FileData' } }, MODE, PROMPT],
      }),
    })
    if (!call.ok) throw httpError(call)
    const { event_id: id } = (await call.json()) as { event_id?: string }
    if (!id) throw new OcrError('Space tidak memberi event_id', true)

    const res = await fetch(`${BASE}/call/run_ocr/${encodeURIComponent(id)}`)
    if (!res.ok) throw httpError(res)
    return parseSse(await res.text())
  } catch (e) {
    if (e instanceof OcrError) throw e
    throw new OcrError('Tidak bisa terhubung ke server OCR.')
  }
}
