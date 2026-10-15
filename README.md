# Barengin — Patungan tanpa ribut

Aplikasi split bill client-side: Vue 3 + TypeScript + Vite + Tailwind CSS v4, scan struk dengan Gemini (Google AI Studio).
Tampilan mengikuti design system **Pinterest Light** (`Design_2.md`), mobile-first lalu tablet dan desktop.

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit test logika uang, normalisasi hasil Gemini, ringkasan WhatsApp
npm run build    # typecheck (vue-tsc) + build produksi ke dist/
npm run preview
```

Butuh Node.js >= 20.19.

## Fitur

- **Sesi aktif**: satu sesi berjalan sampai ditutup, lalu masuk ke **Riwayat** (read-only, bisa disalin ke WhatsApp atau dihapus)
- Mulai sesi → langsung **upload/scan struk bulk** (banyak foto sekaligus, dibaca Gemini) → hasilnya jadi daftar item
- Di daftar item, atur per item siapa yang bayar dan dibagi ke siapa; pembagian custom/satu orang tersedia dari form manual
- Form **Tambah item** dan panel **anggota** ringkas/tersembunyi secara default
- Pajak/service/diskon, pembulatan largest remainder (total selalu pas)
- Saldo bersih per orang + rekomendasi transfer, salin ringkasan ke WhatsApp
- Data sesi tersimpan otomatis di `localStorage` (key `barengin:v2`; data lama `patungan:v1` dimigrasi jadi sesi aktif)
- Navigasi: top navbar di desktop (>= 1024px), bottom navbar di mobile dan tablet

## API key Gemini

Ambil key gratis di [Google AI Studio](https://aistudio.google.com/apikey), lalu:

```bash
cp .env.example .env     # isi VITE_GEMINI_API_KEY=...
npm run dev              # restart dev server setelah mengubah .env
```

`.env` sudah di-`.gitignore`, jadi tidak ikut ter-commit. Tanpa `.env`, app meminta key saat upload pertama dan hanya menyimpannya di memori (tidak di `localStorage`; hilang saat refresh).

> **Penting:** semua variabel `VITE_*` ikut tertanam di bundle JavaScript saat build. Ini aman untuk dipakai lokal, tapi **jangan deploy publik dengan key di `.env`**: siapa pun bisa membacanya dari browser. Untuk deploy publik, pasang backend/proxy kecil yang menyimpan key di server.

## Struktur

```text
src/
├── App.vue                      sesi aktif + riwayat, navbar
├── style.css                    token Pinterest Light + komponen
├── components/
│   ├── BarenginLogo.vue
│   ├── SessionStart.vue         nama sesi + anggota, tombol Mulai
│   ├── ReceiptBulkUpload.vue    input API key + upload banyak struk
│   ├── ExpenseList.vue          daftar item (editable / read-only)
│   ├── ExpenseForm.vue          form tambah manual (tersembunyi default)
│   ├── SplitSelector.vue        equal / exclusive / custom
│   ├── ResultPanel.vue          saldo, transfer, salin WhatsApp
│   ├── BaseSelect.vue           dropdown custom
│   └── MemberAvatar.vue
└── lib/
    ├── split.ts                 allocate, computeShares, balances, settle
    ├── gemini.ts                OCR struk via Gemini + normalisasi hasil
    ├── whatsapp.ts              ringkasan WhatsApp
    ├── store.ts                 sesi + persistence
    ├── sample.ts / format.ts
    └── split.test.ts
```

## Responsif

| Lebar | Layout |
| --- | --- |
| Mobile (< 768px) | Satu kolom, ringkasan di atas, bottom navbar |
| Tablet (768–1023px) | Satu kolom 720px di tengah, field berpasangan 2 kolom, modal di tengah layar |
| Desktop (≥ 1024px) | Dua kolom: konten utama + ringkasan sticky 380px di kanan, lebar maksimum 1120px |

## Catatan

- Font **Pin Sans** bersifat proprietari dan tidak disertakan. Stack font: Pin Sans → Plus Jakarta Sans → font sistem.
- Hasil OCR bisa salah; selalu cek item dan nominal sebelum membagi.
- Copy ke clipboard butuh HTTPS atau localhost; ada fallback `execCommand`.
