# Barengin — Patungan tanpa ribut

Aplikasi split bill client-side: Vue 3 + TypeScript + Vite + Tailwind CSS v4, pencatatan manual.
Tampilan mengikuti design system **Pinterest Light** (`Design_2.md`), mobile-first lalu tablet dan desktop.

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit test logika uang, ringkasan WhatsApp
npm run build    # typecheck (vue-tsc) + build produksi ke dist/
npm run preview
```

Butuh Node.js >= 20.19.

## Fitur

- **Sesi aktif**: satu sesi berjalan sampai ditutup, lalu masuk ke **Riwayat** (read-only, bisa disalin ke WhatsApp atau dihapus)
- Mulai sesi → catat pengeluaran lewat **Tambah item**
- Di daftar item, atur per item siapa yang bayar dan dibagi ke siapa; pembagian custom/satu orang tersedia dari form manual
- Form **Tambah item** dan panel **anggota** ringkas/tersembunyi secara default
- Pajak/service/diskon, pembulatan largest remainder (total selalu pas)
- Saldo bersih per orang + rekomendasi transfer, salin ringkasan ke WhatsApp
- Data sesi tersimpan otomatis di `localStorage` (key `barengin:v2`; data lama `patungan:v1` dimigrasi jadi sesi aktif)
- Navigasi: top navbar di desktop (>= 1024px), bottom navbar di mobile dan tablet

## Scan struk (OCR)

Fitur scan struk **sedang ditahan** sampai ada model OCR yang akurat untuk struk Indonesia. Percobaan sebelumnya (Tesseract, Gemini, PaddleOCR-VL) bisa dilihat di riwayat git.

## Struktur

```text
src/
├── App.vue                      sesi aktif + riwayat, navbar
├── style.css                    token Pinterest Light + komponen
├── components/
│   ├── BarenginLogo.vue
│   ├── SessionStart.vue         nama sesi + anggota, tombol Mulai
│   ├── ExpenseList.vue          daftar item (editable / read-only)
│   ├── ExpenseForm.vue          form tambah manual (tersembunyi default)
│   ├── SplitSelector.vue        equal / exclusive / custom
│   ├── ResultPanel.vue          saldo, transfer, salin WhatsApp
│   ├── BaseSelect.vue           dropdown custom
│   └── MemberAvatar.vue
└── lib/
    ├── split.ts                 allocate, computeShares, balances, settle
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
- Copy ke clipboard butuh HTTPS atau localhost; ada fallback `execCommand`.
