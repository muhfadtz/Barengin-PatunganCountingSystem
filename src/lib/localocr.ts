/**
 * OCR lokal di browser memakai Tesseract.js (tanpa server / token). Data bahasa diunduh sekali saat pertama
 * kali dipakai, jadi butuh internet. Satu worker dipakai ulang untuk beberapa foto.
 */

/** Bahasa OCR: Indonesia, Inggris, atau keduanya (nilai langsung dipakai Tesseract). */
export type OcrLang = 'ind' | 'eng' | 'ind+eng'

export const OCR_LANGS: { value: OcrLang; label: string }[] = [
  { value: 'ind', label: 'Indonesia' },
  { value: 'eng', label: 'Inggris' },
  { value: 'ind+eng', label: 'Keduanya' },
]
export const OCR_LANG_LABEL = Object.fromEntries(OCR_LANGS.map((l) => [l.value, l.label])) as Record<OcrLang, string>

export class OcrError extends Error {
  constructor(
    message: string,
    readonly fatal = false,
  ) {
    super(message)
  }
}

type Worker = {
  recognize(f: File | Blob): Promise<{ data: { text: string } }>
  setParameters(p: Record<string, string>): Promise<unknown>
  terminate(): Promise<unknown>
}

export function createLocalOcr(lang: OcrLang = 'ind+eng') {
  let worker: Promise<Worker> | null = null
  let onProgress: ((p: number) => void) | undefined

  function start(): Promise<Worker> {
    return import('tesseract.js').then(async (t) => {
      const w = (await t.createWorker(lang, 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') onProgress?.(m.progress)
        },
      })) as unknown as Worker
      // Struk = satu blok teks berkolom: pertahankan jarak antar kolom (nama … harga) agar bisa diparsing.
      await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
      return w
    })
  }

  return {
    async recognize(file: File | Blob, progress?: (p: number) => void): Promise<string> {
      onProgress = progress
      worker ??= start()
      let w: Worker
      try {
        w = await worker
      } catch {
        worker = null
        throw new OcrError(
          'OCR tidak bisa dimuat. Pastikan internet aktif (data bahasa diunduh saat pertama kali dipakai), lalu coba lagi.',
          true,
        )
      }
      try {
        return (await w.recognize(file)).data.text
      } catch {
        throw new OcrError('Gagal membaca gambar ini.')
      }
    },
    async close() {
      if (!worker) return
      const w = await worker.catch(() => null)
      await w?.terminate()
      worker = null
    },
  }
}
