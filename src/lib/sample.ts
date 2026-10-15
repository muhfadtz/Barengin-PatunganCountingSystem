import type { Expense, Member } from './split'

export const DUO_MEMBERS: Member[] = [
  { id: 'gue', name: 'Gue' },
  { id: 'dia', name: 'Dia' },
]

export const DEFAULT_CUSTOM_MEMBERS: Member[] = [
  { id: 'andi', name: 'Andi' },
  { id: 'budi', name: 'Budi' },
  { id: 'citra', name: 'Citra' },
]

export function sampleData(): { members: Member[]; expenses: Expense[] } {
  return {
    members: DUO_MEMBERS.map((m) => ({ ...m })),
    expenses: [
      {
        id: 's1',
        title: 'Makan malam',
        amount: 150000,
        tax: 16500,
        paidBy: 'gue',
        split: { type: 'equal', among: ['gue', 'dia'] },
      },
      {
        id: 's2',
        title: 'GoCar pulang',
        amount: 45000,
        tax: 0,
        paidBy: 'gue',
        split: { type: 'exclusive', owner: 'dia' },
      },
      {
        id: 's3',
        title: 'Kopi & dessert',
        amount: 60000,
        tax: -5000,
        paidBy: 'dia',
        split: { type: 'custom', shares: { gue: 35000, dia: 25000 } },
      },
    ],
  }
}
