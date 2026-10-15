import type { ParsedReceipt } from './gemini'

export type Source = 'gemini' | 'ocr' | 'none'

const sum = (r: ParsedReceipt) => r.items.reduce((s, i) => s + i.subtotal, 0)

/**
 * Gabungkan hasil Gemini (`ai`) dan OCR lokal (`local`).
 * - Hanya satu yang punya item → pakai itu.
 * - Keduanya ada → pilih yang total itemnya cocok dengan total struk; kalau seri, utamakan Gemini.
 * - Gemini sering melewatkan pajak/service; kalau pajak dari OCR membuat total Gemini pas, pakai itu.
 */
export function mergeReceipts(
  ai: ParsedReceipt | null,
  local: ParsedReceipt | null,
): { receipt: ParsedReceipt; source: Source } {
  const hasAi = !!ai && ai.items.length > 0
  const hasLocal = !!local && local.items.length > 0
  if (!hasAi && !hasLocal) return { receipt: { items: [], adjustment: 0, total: null }, source: 'none' }
  if (!hasLocal) return { receipt: ai!, source: 'gemini' }
  if (!hasAi) return { receipt: local!, source: 'ocr' }

  const total = ai!.total ?? local!.total
  const aiFit = total !== null && sum(ai!) + ai!.adjustment === total
  const localFit = total !== null && sum(local!) + local!.adjustment === total
  if (aiFit) return { receipt: { ...ai!, total }, source: 'gemini' }
  if (total !== null && sum(ai!) + local!.adjustment === total) {
    return { receipt: { ...ai!, adjustment: local!.adjustment, total }, source: 'gemini' }
  }
  if (localFit) return { receipt: { ...local!, total }, source: 'ocr' }
  return { receipt: { ...ai!, total }, source: 'gemini' }
}
