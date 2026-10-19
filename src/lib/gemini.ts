/**
 * Baca struk langsung dari gambar memakai Gemini (model multimodal, Google AI Studio):
 * satu panggilan mengembalikan item, pajak/diskon, dan total sebagai JSON terstruktur.
 *
 * Browser memanggil `/api/gemini/...` di server Vite; proxy-nya (lihat vite.config.ts) menambahkan API key
 * dari `.env`. Key TIDAK pernah dikirim ke browser / bundle.
 */

export interface ParsedItem {
  name: string
  qty: number
  subtotal: number
}

export interface ParsedReceipt {
  items: ParsedItem[]
  /** Pajak + service + ongkir (positif) dikurangi diskon; bisa negatif. */
  adjustment: number
  /** Total yang tertulis di struk, jika terbaca. */
  total: number | null
}

/**
 * Urutan model yang dicoba: yang pertama dipakai, kalau 404 (tidak ada / sudah dipensiunkan) lanjut ke berikutnya.
 * Paksa satu model lewat VITE_GEMINI_MODEL (nama model bukan rahasia).
 */
const MODELS = import.meta.env.VITE_GEMINI_MODEL
  ? [import.meta.env.VITE_GEMINI_MODEL]
  : ['gemini-3.6-flash', 'gemini-2.5-flash']
const BASE = '/api/gemini/v1beta/models'
// Ingat model yang berhasil supaya struk berikutnya tidak mengulang model yang 404.
let firstTry = 0

const PROMPT = `Kamu membaca foto struk belanja/restoran Indonesia. Ekstrak datanya dengan teliti.

Aturan:
- "items": setiap baris barang/menu yang dibeli. "name" = nama item apa adanya. "qty" = jumlah (default 1). "subtotal" = TOTAL harga baris itu (qty x harga satuan) dalam Rupiah, bilangan bulat tanpa titik/koma. Jangan ambil harga satuan jika ada kolom total baris.
- Jangan masukkan baris Subtotal, Total, Tunai, Kembalian, Pajak, Service, Diskon, ongkir, atau info toko/kasir/tanggal sebagai item.
- "adjustment": jumlah semua pajak (PPN/tax), service charge, ongkir, dan biaya layanan/aplikasi sebagai angka positif, dikurangi semua diskon/promo/voucher. Hasil bisa negatif. 0 jika tidak ada.
- "total": total akhir yang tertulis di struk (grand total / total bayar), atau null jika tidak terbaca.
- Format angka Indonesia: titik = pemisah ribuan ("25.000" = 25000).
- Gambar bisa berupa foto struk kertas ATAU screenshot rincian pesanan dari aplikasi (GoFood, GrabFood, ShopeeFood, kasir digital, m-banking, dll). Untuk screenshot, ambil daftar menu/barang beserta harganya.
- Kembalikan items kosong HANYA jika benar-benar tidak ada daftar barang/menu sama sekali.`

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

export class GeminiError extends Error {
  constructor(
    message: string,
    /** Fatal = tidak ada gunanya mencoba struk lain (key salah, model tidak ada). */
    readonly fatal = false,
  ) {
    super(message)
  }
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
    const o = (it ?? {}) as { name?: unknown; qty?: unknown; subtotal?: unknown }
    const name = String(o.name ?? '').replace(/\s+/g, ' ').trim()
    const subtotal = toInt(o.subtotal)
    const qty = toInt(o.qty)
    if (!name || subtotal <= 0) continue
    items.push({ name, qty: qty > 0 ? qty : 1, subtotal })
  }
  const total = r.total === null || r.total === undefined ? null : toInt(r.total)
  return { items, adjustment: toInt(r.adjustment), total: total && total > 0 ? total : null }
}

/** Selisih total struk vs (item + penyesuaian); null jika total tidak terbaca. Bukan 0 → patut dicek manual. */
export function totalGap(r: ParsedReceipt): number | null {
  if (r.total === null) return null
  return r.total - (r.items.reduce((s, i) => s + i.subtotal, 0) + r.adjustment)
}

/** Perkecil foto (maks 2000px) agar upload ringan; kembalikan base64 JPEG. */
async function toBase64Jpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  const url = canvas.toDataURL('image/jpeg', 0.9)
  return url.slice(url.indexOf(',') + 1)
}

/** Detik tunggu yang disarankan Google pada error 429 (RetryInfo.retryDelay, mis. "23s"); null jika tidak ada. */
export function parseRetryDelay(body: unknown): number | null {
  const details = (body as { error?: { details?: { retryDelay?: unknown }[] } } | null)?.error?.details
  for (const d of Array.isArray(details) ? details : []) {
    const m = typeof d?.retryDelay === 'string' ? d.retryDelay.match(/^(\d+(?:\.\d+)?)s$/) : null
    if (m) return Math.ceil(Number(m[1]))
  }
  return null
}

const MAX_RETRIES = 3
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Satu panggilan ke satu model. Mengembalikan `null` bila model tidak ditemukan (404) agar bisa dicoba model lain.
 * Saat kena batas per menit (429) menunggu sesuai saran Google lalu mencoba lagi; `onWait` memberi tahu UI.
 */
async function callModel(model: string, data: string, onWait?: (sec: number) => void): Promise<ParsedReceipt | null> {
  let res: Response
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data } }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
        }),
      })
    } catch {
      throw new GeminiError('Tidak bisa terhubung ke server. Periksa koneksi internet.')
    }
    if (res.status !== 429) break

    const body = await res.json().catch(() => null)
    if (/per ?day/i.test(JSON.stringify(body ?? '')))
      throw new GeminiError('Kuota harian Gemini habis. Coba lagi besok atau pakai API key lain.', true)
    if (attempt >= MAX_RETRIES)
      throw new GeminiError('Batas permintaan per menit Gemini terlampaui. Tunggu sebentar lalu upload ulang struk yang gagal.')
    const sec = Math.min(parseRetryDelay(body) ?? 5 * 2 ** attempt, 60)
    onWait?.(sec)
    await sleep(sec * 1000)
  }

  if (res.status === 404) return null
  if (res.status === 400 || res.status === 401 || res.status === 403)
    throw new GeminiError('API key Gemini ditolak atau belum diisi. Periksa GEMINI_API_KEY (di .env, atau Environment Variables di Vercel).', true)
  if (!res.ok) throw new GeminiError(`Gemini error (${res.status})`)

  let text: unknown
  try {
    text = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text
  } catch {
    throw new GeminiError('Respons Gemini tidak valid. Periksa pengaturan proxy.', true)
  }
  if (typeof text !== 'string') throw new GeminiError('Gemini tidak mengembalikan hasil (mungkin diblokir filter)')
  try {
    return normalizeReceipt(JSON.parse(text))
  } catch {
    throw new GeminiError('Hasil Gemini tidak bisa dibaca')
  }
}

export async function scanReceipt(file: File, onWait?: (sec: number) => void): Promise<ParsedReceipt> {
  const data = await toBase64Jpeg(file).catch(() => {
    throw new GeminiError('Gambar tidak bisa dibuka')
  })
  for (let i = firstTry; i < MODELS.length; i++) {
    const out = await callModel(MODELS[i], data, onWait)
    if (out) {
      firstTry = i
      return out
    }
  }
  throw new GeminiError(`Model Gemini tidak ditemukan (${MODELS.join(', ')}). Atur VITE_GEMINI_MODEL di .env.`, true)
}
