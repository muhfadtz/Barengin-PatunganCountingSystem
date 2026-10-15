# Barengin — Patungan tanpa ribut

Aplikasi split bill client-side: Vue 3 + TypeScript + Vite + Tailwind CSS v4, scan struk dengan PaddleOCR-VL (Hugging Face Inference Endpoint).
Tampilan mengikuti design system **Pinterest Light** (`Design_2.md`), mobile-first lalu tablet dan desktop.

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit test logika uang, parser struk, ringkasan WhatsApp
npm run build    # typecheck (vue-tsc) + build produksi ke dist/
npm run preview
```

Butuh Node.js >= 20.19.

## Fitur

- **Sesi aktif**: satu sesi berjalan sampai ditutup, lalu masuk ke **Riwayat** (read-only, bisa disalin ke WhatsApp atau dihapus)
- Mulai sesi → langsung **upload/scan struk bulk** (banyak foto sekaligus, dibaca PaddleOCR-VL) → hasilnya jadi daftar item
- Di daftar item, atur per item siapa yang bayar dan dibagi ke siapa; pembagian custom/satu orang tersedia dari form manual
- Form **Tambah item** dan panel **anggota** ringkas/tersembunyi secara default
- Pajak/service/diskon, pembulatan largest remainder (total selalu pas)
- Saldo bersih per orang + rekomendasi transfer, salin ringkasan ke WhatsApp
- Data sesi tersimpan otomatis di `localStorage` (key `barengin:v2`; data lama `patungan:v1` dimigrasi jadi sesi aktif)
- Navigasi: top navbar di desktop (>= 1024px), bottom navbar di mobile dan tablet

## OCR (PaddleOCR-VL di Hugging Face)

OCR memakai [PaddleOCR-VL](https://hf.co/PaddlePaddle/PaddleOCR-VL) yang kamu deploy sendiri sebagai **Inference Endpoint** (GPU, vLLM, API OpenAI-compatible).

1. Di Hugging Face: *Deploy → Inference Endpoints*, pilih model `PaddlePaddle/PaddleOCR-VL` (atau 1.5 / 1.6) dengan engine vLLM. Salin URL endpoint-nya.
2. Buat token di *Settings → Access Tokens* (fine-grained dengan akses ke endpoint, atau token Read).
3. Isi `.env`:

```bash
cp .env.example .env     # isi PADDLEOCR_ENDPOINT dan HF_TOKEN
npm run dev              # restart setelah mengubah .env
```

`PADDLEOCR_ENDPOINT` dan `HF_TOKEN` **tidak** berawalan `VITE_`, jadi hanya dibaca server Vite dan tidak masuk ke JavaScript browser. Browser memanggil `/api/ocr/...`; proxy Vite menambahkan token lalu meneruskannya ke endpoint.

> Proxy ini aktif di `npm run dev` dan `npm run preview`. Untuk deploy statis di hosting publik perlu proxy/backend sendiri yang meneruskan `/api/ocr` ke endpoint dengan token di sisi server.

Keluaran PaddleOCR-VL berupa teks/markdown, bukan daftar item, jadi tetap diparsing (`src/lib/receiptParser.ts`): tabel markdown/HTML diratakan, lalu baris item, pajak/service, diskon, dan total dikenali. Kolom harga dianggap total per baris. Selalu cek hasilnya sebelum membagi.

Endpoint yang `scale-to-zero` butuh beberapa menit untuk menyala pada request pertama; app akan menampilkan pesan agar mencoba lagi.

## Struktur

```text
src/
├── App.vue                      sesi aktif + riwayat, navbar
├── style.css                    token Pinterest Light + komponen
├── components/
│   ├── BarenginLogo.vue
│   ├── SessionStart.vue         nama sesi + anggota, tombol Mulai
│   ├── ReceiptBulkUpload.vue    upload banyak struk → PaddleOCR → item
│   ├── ExpenseList.vue          daftar item (editable / read-only)
│   ├── ExpenseForm.vue          form tambah manual (tersembunyi default)
│   ├── SplitSelector.vue        equal / exclusive / custom
│   ├── ResultPanel.vue          saldo, transfer, salin WhatsApp
│   ├── BaseSelect.vue           dropdown custom
│   └── MemberAvatar.vue
└── lib/
    ├── split.ts                 allocate, computeShares, balances, settle
    ├── paddleocr.ts             klien PaddleOCR-VL (lewat proxy /api/ocr)
    ├── receiptParser.ts         teks OCR → item, pajak, total
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
