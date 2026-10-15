/** Format integer Rupiah: 35000 -> "Rp35.000", -5000 -> "−Rp5.000". */
export function rupiah(n: number): string {
  const abs = Math.abs(Math.trunc(n))
  const body = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '−' : ''}Rp${body}`
}

/** "Rp 35.000" -> 35000. Selalu non-negatif. */
export const toInt = (s: string): number => {
  const d = (s || '').replace(/[^\d]/g, '')
  return d ? parseInt(d, 10) : 0
}

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
