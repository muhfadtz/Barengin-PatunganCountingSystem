export interface Member {
  id: string
  name: string
}

export type Split =
  | { type: 'equal'; among: string[] }
  | { type: 'exclusive'; owner: string }
  | { type: 'custom'; shares: Record<string, number> }

export interface Expense {
  id: string
  title: string
  amount: number
  /** Pajak / service charge (positif) atau diskon (negatif). */
  tax: number
  paidBy: string
  split: Split
  /** Asal item (mis. "Manual"). */
  source?: string
}

export interface Transfer {
  from: string
  to: string
  amount: number
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n)

/**
 * Membagi `total` (integer Rupiah) sesuai bobot memakai metode largest remainder.
 * Jumlah hasil selalu sama persis dengan `total`.
 */
export function allocate(total: number, weights: Record<string, number>): Record<string, number> {
  if (!isInt(total) || total < 0) {
    throw new Error('Nominal harus bilangan bulat Rupiah yang valid (tidak negatif)')
  }
  const keys = Object.keys(weights)
  if (keys.length === 0) throw new Error('Pilih minimal satu peserta')

  let sum = 0
  for (const k of keys) {
    const w = weights[k]
    if (!isInt(w) || w < 0) throw new Error('Bobot harus bilangan bulat tidak negatif')
    sum += w
  }
  if (!isInt(sum) || sum <= 0) throw new Error('Total bobot harus lebih dari 0')

  const out: Record<string, number> = {}
  const remainders: { k: string; r: number; i: number }[] = []
  let given = 0
  keys.forEach((k, i) => {
    const prod = total * weights[k]
    if (!Number.isSafeInteger(prod)) throw new Error('Nominal terlalu besar')
    const base = Math.floor(prod / sum)
    out[k] = base
    given += base
    remainders.push({ k, r: prod - base * sum, i })
  })
  remainders.sort((a, b) => b.r - a.r || a.i - b.i)
  let left = total - given
  for (let j = 0; left > 0; j++, left--) out[remainders[j].k] += 1
  return out
}

/** Total transaksi setelah pajak/service/diskon. */
export function expenseTotal(e: Pick<Expense, 'amount' | 'tax'>): number {
  return e.amount + e.tax
}

/** Bagian tiap anggota (sudah termasuk penyesuaian pajak/diskon). */
export function computeShares(e: Expense): Record<string, number> {
  if (!isInt(e.amount) || e.amount <= 0) throw new Error('Nominal harus lebih dari 0')
  if (!isInt(e.tax)) throw new Error('Pajak/diskon harus bilangan bulat')
  const total = expenseTotal(e)
  if (total < 0) throw new Error('Total setelah penyesuaian tidak boleh negatif')

  const s = e.split
  if (s.type === 'equal') {
    const ids = Array.from(new Set(s.among))
    if (ids.length === 0) throw new Error('Pilih minimal satu peserta')
    return allocate(total, Object.fromEntries(ids.map((id) => [id, 1])))
  }
  if (s.type === 'exclusive') {
    if (!s.owner) throw new Error('Pilih siapa yang menanggung')
    return { [s.owner]: total }
  }
  const sum = Object.values(s.shares).reduce((a, b) => a + b, 0)
  if (sum !== e.amount) throw new Error('Total custom harus sama dengan nominal transaksi')
  return allocate(total, s.shares)
}

/** Saldo bersih: positif = menerima, negatif = harus membayar. */
export function balances(members: Member[], expenses: Expense[]): Record<string, number> {
  const bal: Record<string, number> = Object.fromEntries(members.map((m) => [m.id, 0]))
  for (const e of expenses) {
    const shares = computeShares(e)
    bal[e.paidBy] = (bal[e.paidBy] ?? 0) + expenseTotal(e)
    for (const [id, v] of Object.entries(shares)) bal[id] = (bal[id] ?? 0) - v
  }
  return bal
}

/** Rekomendasi transfer: pasangkan debtor terbesar dengan creditor terbesar. */
export function settle(balance: Record<string, number>): Transfer[] {
  const creditors = Object.entries(balance)
    .filter(([, v]) => v > 0)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount)
  const debtors = Object.entries(balance)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amount: -v }))
    .sort((a, b) => b.amount - a.amount)

  const out: Transfer[] = []
  let i = 0
  let j = 0
  while (i < creditors.length && j < debtors.length) {
    const x = Math.min(creditors[i].amount, debtors[j].amount)
    out.push({ from: debtors[j].id, to: creditors[i].id, amount: x })
    creditors[i].amount -= x
    debtors[j].amount -= x
    if (creditors[i].amount === 0) i++
    if (debtors[j].amount === 0) j++
  }
  return out
}

export function totalSpent(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + expenseTotal(e), 0)
}
