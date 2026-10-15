import type { ParsedItem, ParsedReceipt } from './gemini'

/** "50.000" -> 50000, "25.000,00" -> 25000. */
export function parseMoney(s: string): number {
  const cleaned = s.replace(/,\d{1,2}$/, '').replace(/[^\d]/g, '')
  return cleaned ? parseInt(cleaned, 10) : 0
}

const SKIP =
  /(kasir|tanggal|date|receipt|struk|tunai|cash|kartu|card|pembayaran|payment|customer|table|meja|alamat|npwp|whatsapp|telp|phone|terima kasih|thank|kembali|change|order|waktu)/i
const EXTRA = /(pajak|ppn|tax|vat|service|servis|diskon|discount|promo|voucher)/i
const NEGATIVE = /(diskon|discount|promo|voucher)/i
const SUBTOTAL = /sub\s*total/i
const TOTAL = /^\s*(grand\s*total|total(\s*bayar|\s*pembayaran)?)\b/i
const LAST_AMOUNT = /(\d[\d.,]*)\s*$/
const HAS_LETTER = /[a-zA-Z]/

const P_QTY_X = /^(\d+)\s*[xX]\s+(.+?)\s+(\d[\d.,]*)$/
const P_UNIT = /^(.+?)\s*@\s*(\d[\d.,]*)\s*[xX]\s*(\d+)\s+(\d[\d.,]*)$/
const P_QTY_SPACE = /^(\d+)\s{2,}(.+?)\s+(\d[\d.,]*)$/
const P_PLAIN = /^(.+?)\s+(\d[\d.,]*)$/

function parseItem(line: string): ParsedItem | null {
  let m = line.match(P_QTY_X)
  if (m) return build(m[2], parseInt(m[1], 10), parseMoney(m[3]))
  m = line.match(P_UNIT)
  if (m) return build(m[1], parseInt(m[3], 10), parseMoney(m[4]))
  m = line.match(P_QTY_SPACE)
  if (m) return build(m[2], parseInt(m[1], 10), parseMoney(m[3]))
  m = line.match(P_PLAIN)
  if (m) return build(m[1], 1, parseMoney(m[2]))
  return null
}

function build(name: string, qty: number, subtotal: number): ParsedItem | null {
  const clean = name.replace(/\s+/g, ' ').trim()
  if (!HAS_LETTER.test(clean) || subtotal <= 0) return null
  return { name: clean, qty: qty > 0 ? qty : 1, subtotal }
}

export function parseReceipt(text: string): ParsedReceipt {
  const items: ParsedItem[] = []
  let adjustment = 0
  let total: number | null = null

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/Rp\.?\s*/gi, '').replace(/\s+$/, '').replace(/^\s+/, '')
    if (!line) continue

    if (SUBTOTAL.test(line)) continue

    if (TOTAL.test(line)) {
      const m = line.match(LAST_AMOUNT)
      if (m) total = parseMoney(m[1])
      continue
    }

    if (EXTRA.test(line)) {
      const m = line.match(LAST_AMOUNT)
      if (m) {
        const v = parseMoney(m[1])
        adjustment += NEGATIVE.test(line) ? -v : v
      }
      continue
    }

    if (SKIP.test(line)) continue

    const item = parseItem(line)
    if (item) items.push(item)
  }

  return { items, adjustment, total }
}

/** Total struk: pakai yang terbaca, jika tidak ada pakai total item + penyesuaian. */
export function receiptTotal(parsed: ParsedReceipt): number {
  if (parsed.total !== null) return parsed.total
  return parsed.items.reduce((s, i) => s + i.subtotal, 0) + parsed.adjustment
}

/** OCR lokal (Tesseract.js, dimuat lazy). Satu worker dipakai ulang untuk beberapa foto. */
export function createLocalOcr() {
  type W = { recognize(f: File | Blob): Promise<{ data: { text: string } }>; terminate(): Promise<unknown> }
  let worker: Promise<W> | null = null
  return {
    async recognize(file: File | Blob): Promise<string> {
      worker ??= import('tesseract.js').then((t) => t.createWorker('eng') as unknown as Promise<W>)
      const w = await worker
      const { data } = await w.recognize(file)
      return data.text
    },
    async close() {
      if (!worker) return
      const w = await worker.catch(() => null)
      await w?.terminate()
      worker = null
    },
  }
}
