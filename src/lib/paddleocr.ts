/**
 * OCR struk memakai PaddleOCR-VL yang di-deploy sebagai Hugging Face Inference Endpoint (vLLM, API OpenAI-compatible).
 *
 * Browser memanggil `/api/ocr/...` di server Vite; proxy-nya (lihat vite.config.ts) menambahkan token HF
 * dan meneruskan ke endpoint. Token TIDAK pernah dikirim ke browser / bundle.
 */

export const OCR_PATH = '/api/ocr/v1/chat/completions'
// Nama model yang disajikan endpoint (bukan rahasia). Ubah lewat VITE_PADDLEOCR_MODEL jika endpoint memakai nama lain.
const MODEL = import.meta.env.VITE_PADDLEOCR_MODEL || 'PaddlePaddle/PaddleOCR-VL'
const PROMPT = 'OCR:'

export class OcrError extends Error {
  constructor(
    message: string,
    readonly fatal = false,
  ) {
    super(message)
  }
}

/** Perkecil foto (maks 1600px) agar upload ringan; kembalikan data URL JPEG. */
async function toJpegDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.9)
}

/** Kirim satu foto ke PaddleOCR-VL dan kembalikan teks mentah hasil OCR. */
export async function recognizeReceipt(file: File): Promise<string> {
  const url = await toJpegDataUrl(file).catch(() => {
    throw new OcrError('Gambar tidak bisa dibuka')
  })

  let res: Response
  try {
    res = await fetch(OCR_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    })
  } catch {
    throw new OcrError('Tidak bisa terhubung ke server OCR.')
  }

  if (res.status === 404 || res.status === 405)
    throw new OcrError('Endpoint OCR belum dikonfigurasi. Isi PADDLEOCR_ENDPOINT dan HF_TOKEN di .env lalu restart server.', true)
  if (res.status === 401 || res.status === 403)
    throw new OcrError('Token Hugging Face ditolak. Periksa HF_TOKEN di .env.', true)
  if (res.status === 502 || res.status === 503 || res.status === 504)
    throw new OcrError('Endpoint sedang menyala (cold start) atau tidak aktif. Tunggu sebentar lalu coba lagi.')
  if (!res.ok) throw new OcrError(`Server OCR error (${res.status})`)

  let json: { choices?: { message?: { content?: string } }[] }
  try {
    json = await res.json()
  } catch {
    throw new OcrError('Respons OCR tidak valid. Periksa PADDLEOCR_ENDPOINT.', true)
  }
  const text = json.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new OcrError('OCR tidak mengembalikan teks')
  return text
}
