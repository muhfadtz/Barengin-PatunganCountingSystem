/** OCR struk memakai Gemini (Google AI Studio). Dipanggil langsung dari browser dengan API key milik user. */

export interface ParsedItem {
  name: string
  qty: number
  subtotal: number
}

export interface ParsedReceipt {
  items: ParsedItem[]
  /** Pajak + service (positif) dan diskon (negatif), digabung. */
  adjustment: number
  /** Total yang tertulis di struk, jika terbaca. */
  total: number | null
}

export const MODEL = 'gemini-2.5-flash'
/**
 * Sumber API key, berurutan:
 * 1. `VITE_GEMINI_API_KEY` dari file `.env` (tidak di-commit, lihat `.env.example`).
 * 2. Diketik di app: hanya di memori, TIDAK di localStorage/sessionStorage/cookie.
 */
const envKey = (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim()
let memoryKey = ''

// Bersihkan key yang pernah tersimpan oleh versi sebelumnya.
try {
  localStorage.removeItem('barengin:gemini-key')
} catch {
  /* storage diblokir: tidak ada yang perlu dibersihkan */
}

export const hasEnvKey = envKey !== ''

export function loadApiKey(): string {
  return envKey || memoryKey
}
export function saveApiKey(key: string) {
  memoryKey = key
}

const PROMPT = `Kamu membaca foto struk belanja/restoran Indonesia. Ekstrak datanya dengan teliti.

Aturan:
- "items": setiap baris barang/menu yang dibeli. "name" = nama item apa adanya (rapikan salah ketik OCR yang jelas). "qty" = jumlah (default 1). "subtotal" = TOTAL harga baris itu (qty x harga satuan) dalam Rupiah, bilangan bulat tanpa titik/koma. Jangan ambil harga satuan jika ada kolom total baris.
- Jangan masukkan baris Subtotal, Total, Tunai, Kembalian, Pajak, Service, Diskon, atau info toko/kasir/tanggal sebagai item.
- "adjustment": jumlah semua pajak (PPN/tax), service charge, dan biaya tambahan sebagai angka positif, dikurangi semua diskon/promo/voucher. Hasil bisa negatif. 0 jika tidak ada.
- "total": total akhir yang tertulis di struk (grand total / total bayar), atau null jika tidak terbaca.
- Format angka Indonesia: titik = pemisah ribuan ("25.000" = 25000).
- Jika foto bukan struk atau tidak terbaca, kembalikan items kosong.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          qty: { type: 'INTEGER' },
          subtotal: { type: 'INTEGER' },
        },
        required: ['name', 'qty', 'subtotal'],
      },
    },
    adjustment: { type: 'INTEGER' },
    total: { type: 'INTEGER', nullable: true },
  },
  required: ['items', 'adjustment'],
}

const toInt = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d-]/g, '')) : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** Rapikan keluaran model: paksa integer, buang item tidak valid. */
export function normalizeReceipt(raw: unknown): ParsedReceipt {
  const r = (raw ?? {}) as { items?: unknown; adjustment?: unknown; total?: unknown }
  const items: ParsedItem[] = []
  for (const it of Array.isArray(r.items) ? r.items : []) {
    const name = String((it as { name?: unknown })?.name ?? '').replace(/\s+/g, ' ').trim()
    const subtotal = toInt((it as { subtotal?: unknown })?.subtotal)
    const qty = toInt((it as { qty?: unknown })?.qty)
    if (!name || subtotal <= 0) continue
    items.push({ name, qty: qty > 0 ? qty : 1, subtotal })
  }
  const total = r.total === null || r.total === undefined ? null : toInt(r.total)
  return { items, adjustment: toInt(r.adjustment), total: total && total > 0 ? total : null }
}

/** Perkecil foto (maks 1600px) agar upload ringan; kembalikan base64 JPEG. */
async function toBase64Jpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  const url = canvas.toDataURL('image/jpeg', 0.88)
  return url.slice(url.indexOf(',') + 1)
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly fatal = false,
  ) {
    super(message)
  }
}

export async function scanReceipt(file: File, apiKey: string): Promise<ParsedReceipt> {
  const data = await toBase64Jpeg(file).catch(() => {
    throw new GeminiError('Gambar tidak bisa dibuka')
  })
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data } }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
          },
        }),
      },
    )
  } catch {
    throw new GeminiError('Tidak bisa terhubung ke Gemini. Periksa koneksi internet.')
  }

  if (!res.ok) {
    if (res.status === 400 || res.status === 403)
      throw new GeminiError('API key Gemini ditolak. Periksa kembali key-nya.', true)
    if (res.status === 429) throw new GeminiError('Kuota Gemini habis / terlalu cepat. Coba lagi sebentar.')
    throw new GeminiError(`Gemini error (${res.status})`)
  }
  const json = await res.json()
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new GeminiError('Gemini tidak mengembalikan hasil')
  try {
    return normalizeReceipt(JSON.parse(text))
  } catch {
    throw new GeminiError('Hasil Gemini tidak bisa dibaca')
  }
}
