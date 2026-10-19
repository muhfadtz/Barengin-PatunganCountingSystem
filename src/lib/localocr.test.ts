import { describe, expect, it, vi } from 'vitest'

const createWorker = vi.fn(async () => ({
  recognize: async () => ({ data: { text: 'halo' } }),
  setParameters: async () => undefined,
  terminate: async () => undefined,
}))
vi.mock('tesseract.js', () => ({ createWorker }))

import { createLocalOcr, OCR_LANGS } from './localocr'

describe('createLocalOcr (pilihan bahasa)', () => {
  it('menyediakan tiga pilihan: Indonesia, Inggris, keduanya', () => {
    expect(OCR_LANGS.map((l) => l.value)).toEqual(['ind', 'eng', 'ind+eng'])
  })

  it.each(['ind', 'eng', 'ind+eng'] as const)('meneruskan bahasa %s ke Tesseract', async (lang) => {
    createWorker.mockClear()
    const ocr = createLocalOcr(lang)
    expect(await ocr.recognize(new Blob(['x']))).toBe('halo')
    expect(createWorker.mock.calls[0][0]).toBe(lang)
    await ocr.close()
  })

  it('default keduanya', async () => {
    createWorker.mockClear()
    await createLocalOcr().recognize(new Blob(['x']))
    expect(createWorker.mock.calls[0][0]).toBe('ind+eng')
  })
})
