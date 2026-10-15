import { rupiah } from './format'
import { balances, expenseTotal, settle, totalSpent } from './split'
import type { Expense, Member } from './split'

export function buildWhatsAppMessage(members: Member[], expenses: Expense[]): string {
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id
  const bal = balances(members, expenses)
  const transfers = settle(bal)

  const lines: string[] = []
  lines.push('📋 Bagiin — Ringkasan Patungan', '')
  lines.push(`💰 Total Pengeluaran: ${rupiah(totalSpent(expenses))}`, '')

  lines.push('💸 HASIL TRANSFER')
  if (transfers.length === 0) lines.push('• Semua sudah impas 🎉')
  for (const t of transfers) {
    lines.push(`• ${name(t.from)} bayar ke ${name(t.to)}: ${rupiah(t.amount)}`)
  }
  lines.push('')

  lines.push('📊 Saldo Bersih Tiap Orang')
  for (const m of members) {
    const v = bal[m.id] ?? 0
    if (v > 0) lines.push(`• ${m.name}: +${rupiah(v)} (menerima)`)
    else if (v < 0) lines.push(`• ${m.name}: ${rupiah(v)} (harus bayar)`)
    else lines.push(`• ${m.name}: impas`)
  }
  lines.push('')

  lines.push('📝 Rincian Pengeluaran')
  expenses.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.title} — ${rupiah(expenseTotal(e))} (dibayar ${name(e.paidBy)})`)
  })

  return lines.join('\n')
}
