import { describe, expect, it } from 'vitest'
import { allocate, balances, computeShares, settle } from './split'
import type { Expense, Member } from './split'
import { parseReceipt, receiptTotal } from './ocr'
import { buildWhatsAppMessage } from './whatsapp'
import { rupiah, toInt } from './format'

const exp = (over: Partial<Expense>): Expense => ({
  id: 'x',
  title: 'T',
  amount: 100000,
  tax: 0,
  paidBy: 'a',
  split: { type: 'equal', among: ['a', 'b'] },
  ...over,
})

describe('allocate', () => {
  it('membagi dua orang rata', () => {
    expect(allocate(100000, { a: 1, b: 1 })).toEqual({ a: 50000, b: 50000 })
  })
  it('largest remainder untuk tiga orang, total tetap', () => {
    const r = allocate(100, { a: 1, b: 1, c: 1 })
    expect(r).toEqual({ a: 34, b: 33, c: 33 })
    expect(r.a + r.b + r.c).toBe(100)
  })
  it('mendukung bobot custom', () => {
    expect(allocate(100, { a: 60, b: 40 })).toEqual({ a: 60, b: 40 })
  })
  it('menolak float dan input kosong', () => {
    expect(() => allocate(10.5, { a: 1 })).toThrow()
    expect(() => allocate(100, {})).toThrow()
    expect(() => allocate(100, { a: 0, b: 0 })).toThrow()
  })
})

describe('computeShares', () => {
  it('exclusive', () => {
    expect(computeShares(exp({ split: { type: 'exclusive', owner: 'a' } }))).toEqual({ a: 100000 })
  })
  it('pajak proporsional pada custom', () => {
    const s = computeShares(
      exp({ tax: 10000, split: { type: 'custom', shares: { a: 60000, b: 40000 } } }),
    )
    expect(s).toEqual({ a: 66000, b: 44000 })
  })
  it('diskon negatif', () => {
    expect(computeShares(exp({ tax: -5000 }))).toEqual({ a: 47500, b: 47500 })
  })
  it('menolak total negatif dan custom tidak cocok', () => {
    expect(() => computeShares(exp({ amount: 1000, tax: -2000 }))).toThrow()
    expect(() =>
      computeShares(exp({ split: { type: 'custom', shares: { a: 1, b: 1 } } })),
    ).toThrow()
  })
})

describe('balances & settle', () => {
  const members: Member[] = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ]
  it('saldo tiga orang', () => {
    const bal = balances(members, [
      exp({ amount: 90000, split: { type: 'equal', among: ['a', 'b', 'c'] } }),
    ])
    expect(bal).toEqual({ a: 60000, b: -30000, c: -30000 })
  })
  it('settlement menutup semua saldo', () => {
    const t = settle({ a: 60000, b: -30000, c: -30000 })
    expect(t).toHaveLength(2)
    expect(t.every((x) => x.to === 'a')).toBe(true)
    expect(t.reduce((s, x) => s + x.amount, 0)).toBe(60000)
  })
})

describe('OCR parser', () => {
  const text = `KEDAI MAKAN
Kasir: Budi
2 x Nasi Goreng 50.000
Es Teh  10.000
Service 5.000
Diskon 3.000
PPN 11% 6.600
Total 68.600`
  it('mengenali item, extra, dan total', () => {
    const p = parseReceipt(text)
    expect(p.items).toEqual([
      { name: 'Nasi Goreng', qty: 2, subtotal: 50000 },
      { name: 'Es Teh', qty: 1, subtotal: 10000 },
    ])
    expect(p.adjustment).toBe(8600)
    expect(p.total).toBe(68600)
  })
  it('fallback total dari item + penyesuaian', () => {
    const p = parseReceipt('Nasi Goreng @25.000 x2 50.000\nPajak 5.000')
    expect(p.total).toBeNull()
    expect(receiptTotal(p)).toBe(55000)
  })
})

describe('format & WhatsApp', () => {
  it('format rupiah dan toInt', () => {
    expect(rupiah(35000)).toBe('Rp35.000')
    expect(toInt('Rp 35.000')).toBe(35000)
  })
  it('ringkasan WhatsApp', () => {
    const members: Member[] = [
      { id: 'gue', name: 'Gue' },
      { id: 'dia', name: 'Dia' },
    ]
    const msg = buildWhatsAppMessage(members, [
      exp({ paidBy: 'gue', split: { type: 'equal', among: ['gue', 'dia'] } }),
    ])
    expect(msg).toContain('• Dia bayar ke Gue: Rp50.000')
    expect(msg).toContain('• Gue: +Rp50.000 (menerima)')
  })
})
