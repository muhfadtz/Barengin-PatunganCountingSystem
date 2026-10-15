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

/** Jalankan OCR (Tesseract.js dimuat lazy supaya bundle awal ringan). */
export async function recognizeReceipt(
  file: File | Blob,
  onProgress?: (p: number) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(file)
    return data.text
  } finally {
    await worker.terminate()
  }
}

/**
 * OCR banyak struk sekaligus memakai satu worker (bahasa hanya diunduh sekali).
 * `onUpdate` dipanggil per file: status "reading" dengan progres, lalu "done" / "error".
 */
export async function recognizeReceipts(
  files: File[],
  onUpdate: (
    index: number,
    state: { status: 'reading' | 'done' | 'error'; progress: number; text?: string },
  ) => void,
): Promise<void> {
  const { createWorker } = await import('tesseract.js')
  let current = 0
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onUpdate(current, { status: 'reading', progress: m.progress })
    },
  })
  try {
    for (let i = 0; i < files.length; i++) {
      current = i
      onUpdate(i, { status: 'reading', progress: 0 })
      try {
        const { data } = await worker.recognize(files[i])
        onUpdate(i, { status: 'done', progress: 1, text: data.text })
      } catch {
        onUpdate(i, { status: 'error', progress: 0 })
      }
    }
  } finally {
    await worker.terminate()
  }
}
