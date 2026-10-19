import type { ParsedReceipt } from './receiptParser'

export type Source = 'llm' | 'rules' | 'none'

const sum = (r: ParsedReceipt) => r.items.reduce((s, i) => s + i.subtotal, 0)

/**
 * Gabungkan hasil LLM (`ai`) dan parser aturan (`local`).
 * - Hanya satu yang punya item → pakai itu.
 * - Keduanya ada → pilih yang total itemnya cocok dengan total struk; kalau seri, utamakan LLM.
 * - LLM kecil kadang melewatkan pajak/service; kalau pajak dari parser aturan membuat total LLM pas, pakai itu.
 */
export function mergeReceipts(
  ai: ParsedReceipt | null,
  local: ParsedReceipt | null,
): { receipt: ParsedReceipt; source: Source } {
  const hasAi = !!ai && ai.items.length > 0
  const hasLocal = !!local && local.items.length > 0
  if (!hasAi && !hasLocal) return { receipt: { items: [], adjustment: 0, total: null }, source: 'none' }
  if (!hasLocal) return { receipt: ai!, source: 'llm' }
  if (!hasAi) return { receipt: local!, source: 'rules' }

  const total = ai!.total ?? local!.total
  const aiFit = total !== null && sum(ai!) + ai!.adjustment === total
  const localFit = total !== null && sum(local!) + local!.adjustment === total
  if (aiFit) return { receipt: { ...ai!, total }, source: 'llm' }
  if (total !== null && sum(ai!) + local!.adjustment === total) {
    return { receipt: { ...ai!, adjustment: local!.adjustment, total }, source: 'llm' }
  }
  if (localFit) return { receipt: { ...local!, total }, source: 'rules' }
  return { receipt: { ...ai!, total }, source: 'llm' }
}
