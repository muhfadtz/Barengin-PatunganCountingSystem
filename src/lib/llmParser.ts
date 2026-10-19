/**
 * Parser struk berbasis LLM kecil (Qwen2.5-1.5B-Instruct lewat Hugging Face Inference Providers).
 * Menerima teks mentah hasil OCR dan mengembalikan item terstruktur. Dipanggil lewat proxy `/api/llm`
 * (token HF ditambahkan di sisi server, lihat vite.config.ts).
 */
import { cleanOcrText, parseMoney } from './receiptParser'
import type { ParsedItem, ParsedReceipt } from './receiptParser'

export const LLM_PATH = '/api/llm/v1/chat/completions'
// Model kecil yang berstatus live di Inference Providers. Ganti lewat VITE_LLM_MODEL (nama model bukan rahasia).
const MODEL = import.meta.env.VITE_LLM_MODEL || 'Qwen/Qwen2.5-1.5B-Instruct'

const SYSTEM = `Kamu mengubah teks hasil OCR struk/pesanan Indonesia menjadi JSON. Balas HANYA JSON valid tanpa penjelasan, tanpa markdown.

Skema:
{"items":[{"name":string,"qty":integer,"subtotal":integer}],"adjustment":integer,"total":integer|null}

Aturan:
- items: setiap baris barang/menu yang dibeli. name = nama item (rapikan salah baca OCR yang jelas). qty = jumlah (default 1). subtotal = TOTAL harga baris itu (qty x harga satuan) dalam Rupiah, bilangan bulat tanpa titik/koma.
- Jangan masukkan Subtotal, Total, Tunai, Kembalian, Pajak, Service, Diskon, ongkir, atau info toko/kasir/tanggal sebagai item.
- adjustment: semua pajak (PPN/tax), service, ongkir, dan biaya layanan/aplikasi dijumlahkan sebagai angka positif, dikurangi semua diskon/promo/voucher. Bisa negatif. 0 jika tidak ada.
- total: total akhir yang tertulis (grand total / total bayar), atau null jika tidak ada.
- Angka Indonesia: titik = pemisah ribuan ("25.000" = 25000).
- Jika tidak ada daftar barang sama sekali, items = [].`

export class LlmError extends Error {}

const toInt = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d-]/g, '')) : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** Ambil objek JSON pertama dari balasan model (kadang dibungkus ```json … ``` atau ada teks tambahan). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new LlmError('Balasan LLM bukan JSON')
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new LlmError('Balasan LLM bukan JSON yang valid')
  }
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

/**
 * Penjaga halusinasi: LLM kecil bisa "mengarang" item. Terima item hanya jika nominalnya benar-benar
 * tertulis di teks OCR (sebagai total baris, atau harga satuan x qty). Total yang tidak ada di teks dibuang.
 */
export function groundInText(r: ParsedReceipt, ocrText: string): ParsedReceipt {
  const nums = new Set((ocrText.match(/\d[\d.,]*/g) ?? []).map(parseMoney).filter((n) => n > 0))
  const items = r.items.filter(
    (i) => nums.has(i.subtotal) || (i.qty > 1 && i.subtotal % i.qty === 0 && nums.has(i.subtotal / i.qty)),
  )
  return { ...r, items, total: r.total !== null && nums.has(r.total) ? r.total : null }
}

/** Parse teks OCR dengan LLM kecil. Melempar LlmError bila layanan tidak tersedia / balasan tidak valid. */
export async function parseWithLlm(ocrText: string): Promise<ParsedReceipt> {
  const text = cleanOcrText(ocrText).trim().slice(0, 6000)
  if (!text) return { items: [], adjustment: 0, total: null }

  let res: Response
  try {
    res = await fetch(LLM_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: text },
        ],
      }),
    })
  } catch {
    throw new LlmError('Tidak bisa terhubung ke layanan LLM.')
  }
  if (res.status === 401 || res.status === 403) throw new LlmError('Token HF ditolak untuk Inference Providers (cek izin token).')
  if (res.status === 404 || res.status === 400) throw new LlmError(`Model ${MODEL} tidak tersedia di Inference Providers.`)
  if (res.status === 402 || res.status === 429) throw new LlmError('Kredit/kuota Inference Providers habis.')
  if (!res.ok) throw new LlmError(`LLM error (${res.status})`)

  let content: unknown
  try {
    content = ((await res.json()) as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content
  } catch {
    throw new LlmError('Respons LLM tidak valid')
  }
  if (typeof content !== 'string') throw new LlmError('LLM tidak mengembalikan teks')
  return normalizeReceipt(extractJson(content))
}
