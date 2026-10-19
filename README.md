# Barengin — Patungan tanpa ribut

Aplikasi split bill client-side: Vue 3 + TypeScript + Vite + Tailwind CSS v4, scan struk dengan Unlimited-OCR (Hugging Face Space).
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

- **Satu sesi, tanpa penyimpanan**: tidak ada riwayat dan tidak ada `localStorage`/`sessionStorage`/cookie. Data hanya di memori dan hilang saat halaman di-refresh (browser akan memberi peringatan bila sudah ada item). Tombol "Sesi baru" menghapus semuanya.
- Mulai sesi → **upload banyak struk sekaligus** (dibaca Unlimited-OCR) → hasilnya jadi daftar item, atau catat manual lewat **Tambah item**
- Di daftar item, atur per item siapa yang bayar dan dibagi ke siapa; pembagian custom/satu orang tersedia dari form manual
- Panel anggota ringkas (tumpukan avatar) dan form tambah item tersembunyi secara default
- Pajak/service/diskon, pembulatan largest remainder (total selalu pas)
- Saldo bersih per orang + rekomendasi transfer, salin ringkasan ke WhatsApp

## Scan struk (Unlimited-OCR)

Memakai [baidu/Unlimited-OCR](https://hf.co/baidu/Unlimited-OCR) lewat [Space resminya](https://hf.co/spaces/baidu/Unlimited-OCR) (ZeroGPU, API Gradio). Cukup token Hugging Face; **kuota ZeroGPU akun pemilik token** yang terpakai.

```bash
cp .env.example .env     # isi HF_TOKEN
npm run dev              # restart setelah mengubah .env
```

`HF_TOKEN` **tidak** berawalan `VITE_`, jadi hanya dibaca server Vite dan tidak masuk ke JavaScript browser. Browser memanggil `/api/ocr/...`; proxy Vite menambahkan token lalu meneruskan ke Space (alamat bisa diganti lewat `UNLIMITED_OCR_URL`, mis. ke instance vLLM/Space milikmu sendiri selama API-nya sama).

> Proxy ini aktif di `npm run dev` dan `npm run preview`. Untuk deploy publik perlu proxy/backend sendiri yang meneruskan `/api/ocr` ke Space dengan token di sisi server.

Space adalah demo bersama di ZeroGPU: bisa antre, tidur (cold start), atau kehabisan kuota harian; struk diproses satu per satu. Keluaran model berupa teks/markdown, bukan daftar item, sehingga diparsing (`src/lib/receiptParser.ts`). Kolom harga dianggap total per baris. Selalu cek hasilnya sebelum membagi.

## Struktur

```text
src/
├── App.vue                      satu sesi (in-memory)
├── style.css                    token Pinterest Light + komponen
├── components/
│   ├── BarenginLogo.vue
│   ├── SessionStart.vue         nama sesi + anggota, tombol Mulai
│   ├── ReceiptBulkUpload.vue    upload banyak struk → Unlimited-OCR → item
│   ├── ExpenseList.vue          daftar item (editable / read-only)
│   ├── ExpenseForm.vue          form tambah manual (tersembunyi default)
│   ├── SplitSelector.vue        equal / exclusive / custom
│   ├── ResultPanel.vue          saldo, transfer, salin WhatsApp
│   ├── BaseSelect.vue           dropdown custom
│   └── MemberAvatar.vue
└── lib/
    ├── split.ts                 allocate, computeShares, balances, settle
    ├── whatsapp.ts              ringkasan WhatsApp
    ├── unlimitedocr.ts          klien Space Unlimited-OCR (lewat proxy /api/ocr)
    ├── receiptParser.ts         teks OCR → item, pajak, total
    ├── store.ts                 sesi in-memory
    ├── sample.ts / format.ts
    └── split.test.ts
```

## Responsif

| Lebar | Layout |
| --- | --- |
| Mobile (< 768px) | Satu kolom, ringkasan di atas, tombol besar (min 48px) |
| Tablet (768–1023px) | Satu kolom 720px di tengah, field berpasangan 2 kolom, modal di tengah layar |
| Desktop (≥ 1024px) | Dua kolom: konten utama + ringkasan sticky 380px di kanan, lebar maksimum 1120px |

## Catatan

- Font **Pin Sans** bersifat proprietari dan tidak disertakan. Stack font: Pin Sans → Plus Jakarta Sans → font sistem.
- Copy ke clipboard butuh HTTPS atau localhost; ada fallback `execCommand`.
