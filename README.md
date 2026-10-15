# Barengin — Patungan tanpa ribut

Aplikasi split bill client-side: Vue 3 + TypeScript + Vite + Tailwind CSS v4, OCR struk dengan Tesseract.js.
Tampilan mengikuti design system **Pinterest Light** (`Design_2.md`), mobile-first lalu tablet dan desktop.

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit test logika uang, parser OCR, ringkasan WhatsApp
npm run build    # typecheck (vue-tsc) + build produksi ke dist/
npm run preview
```

Butuh Node.js >= 20.19.

## Fitur

- Template cepat "Gue & Dia" atau custom session dengan anggota dinamis (minimal 2)
- Pengeluaran manual dengan pajak/service charge atau diskon
- Pembagian rata, satu orang, atau custom per anggota (pembulatan largest remainder, total selalu pas)
- Scan struk (OCR) → review item → impor sebagai pengeluaran
- Saldo bersih per orang + rekomendasi transfer
- Salin ringkasan ke WhatsApp
- Data tersimpan otomatis di `localStorage` (key `patungan:v1`)

## Struktur

```text
src/
├── App.vue                      orkestrator utama
├── style.css                    token Pinterest Light + komponen (btn, chip, card, sheet, …)
├── components/
│   ├── BarenginLogo.vue
│   ├── SplitSelector.vue        equal / exclusive / custom
│   └── ReceiptUploadModal.vue   upload → OCR → review → impor (bottom sheet di mobile)
└── lib/
    ├── split.ts                 allocate, computeShares, balances, settle
    ├── ocr.ts                   parser struk + wrapper Tesseract.js (lazy import)
    ├── whatsapp.ts              ringkasan WhatsApp
    ├── store.ts                 state + persistence
    ├── sample.ts / format.ts
    └── split.test.ts
```

Flow multi-step legacy (`Step*.vue`, `calculate.ts`, dll.) sengaja tidak disertakan agar tidak ada duplikasi state.

## Responsif

| Lebar | Layout |
| --- | --- |
| Mobile (< 768px) | Satu kolom, ringkasan di atas, tombol besar (min 48px), modal OCR sebagai bottom sheet |
| Tablet (768–1023px) | Satu kolom 720px di tengah, field berpasangan 2 kolom, modal di tengah layar |
| Desktop (≥ 1024px) | Dua kolom: konten utama + ringkasan sticky 380px di kanan, lebar maksimum 1120px |

## Catatan

- Font **Pin Sans** bersifat proprietari dan tidak disertakan. Stack font: Pin Sans → Plus Jakarta Sans → font sistem. Jika punya lisensinya, tambahkan `@font-face` di `style.css`.
- OCR pertama kali memerlukan internet karena Tesseract.js mengunduh data bahasa `eng`.
- Hasil OCR bersifat heuristik; selalu review sebelum mengimpor.
- Copy ke clipboard butuh HTTPS atau localhost; ada fallback `execCommand`.
