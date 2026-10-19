# Barengin — Patungan tanpa ribut

Aplikasi split bill client-side: Vue 3 + TypeScript + Vite + Tailwind CSS v4, scan struk dengan Tesseract.js + LLM kecil sebagai parser.
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
- Mulai sesi → **upload banyak struk sekaligus** (OCR di browser) → hasilnya jadi daftar item, atau catat manual lewat **Tambah item**
- Di daftar item, atur per item siapa yang bayar dan dibagi ke siapa; pembagian custom/satu orang tersedia dari form manual
- Pilihan 2 orang (mis. Gue & Dia) berupa tombol langsung, bukan dropdown; panel anggota ringkas (tumpukan avatar) dan form tambah item tersembunyi secara default
- Pajak/service/diskon, pembulatan largest remainder (total selalu pas)
- Saldo bersih per orang + rekomendasi transfer, salin ringkasan ke WhatsApp

## Scan struk

Dua tahap:

1. **OCR di browser** dengan [Tesseract.js](https://github.com/naptha/tesseract.js) (bahasa Indonesia + Inggris `ind+eng`, mode satu blok teks dengan jarak kolom dipertahankan). Tanpa server dan tanpa token. Data bahasa (beberapa MB, dua bahasa) diunduh sekali saat pertama kali dipakai, jadi butuh internet.
2. **Parsing** teks OCR menjadi item, pajak, dan total oleh LLM kecil + parser aturan (di bawah).

Hanya LLM parser yang butuh token:

```bash
cp .env.example .env     # isi HF_TOKEN (opsional)
npm run dev              # restart setelah mengubah .env
```

`HF_TOKEN` **tidak** berawalan `VITE_`, jadi hanya dibaca server Vite dan tidak masuk ke JavaScript browser. Browser memanggil `/api/llm/...`; proxy Vite menambahkan token. Tanpa token, parsing tetap jalan dengan parser aturan saja.

> Proxy ini aktif di `npm run dev` dan `npm run preview`. Untuk deploy publik perlu proxy/backend sendiri yang meneruskan `/api/llm` ke Inference Providers dengan token di sisi server.

Tesseract kurang akurat untuk screenshot beresolusi kecil atau teks yang rapat. Struk yang tetap "Tidak terbaca" punya tombol **Lihat teks OCR** untuk melihat teks mentahnya.

### Parsing teks OCR

Keluaran OCR berupa teks mentah, bukan daftar item. Teks itu diparsing dua cara lalu digabung (`src/lib/merge.ts`):

1. **LLM kecil**: `Qwen/Qwen2.5-1.5B-Instruct` lewat [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers) (API OpenAI-compatible, token `HF_TOKEN` yang sama; token fine-grained butuh izin *Make calls to Inference Providers*, memakai kredit HF akunmu). Ganti model lewat `VITE_LLM_MODEL`, dan alamat lewat `LLM_BASE_URL`.
2. **Parser aturan** (`src/lib/receiptParser.ts`): regex untuk tabel markdown/HTML, qty, pajak, diskon, total. Ini juga cadangan kalau LLM tidak tersedia.

Karena model 1,5B bisa mengarang item, hasil LLM hanya diterima jika nominalnya benar-benar ada di teks OCR (`groundInText`). Dari dua hasil, dipilih yang jumlah item + pajaknya cocok dengan total struk; kalau seri, LLM yang dipakai. Struk yang tetap "Tidak terbaca" punya tombol **Lihat teks OCR** untuk melihat teks mentahnya. Selalu cek hasilnya sebelum membagi.

## Struktur

```text
src/
├── App.vue                      satu sesi (in-memory)
├── style.css                    token Pinterest Light + komponen
├── components/
│   ├── BarenginLogo.vue
│   ├── SessionStart.vue         nama sesi + anggota, tombol Mulai
│   ├── ReceiptBulkUpload.vue    upload banyak struk → Tesseract → LLM/parser → item
│   ├── ExpenseList.vue          daftar item (editable / read-only)
│   ├── ExpenseForm.vue          form tambah manual (tersembunyi default)
│   ├── SplitSelector.vue        equal / exclusive / custom
│   ├── ResultPanel.vue          saldo, transfer, salin WhatsApp
│   ├── BaseSelect.vue           dropdown custom (2 opsi → tombol segmented)
│   └── MemberAvatar.vue
└── lib/
    ├── split.ts                 allocate, computeShares, balances, settle
    ├── whatsapp.ts              ringkasan WhatsApp
    ├── localocr.ts              OCR Tesseract.js di browser
    ├── llmParser.ts             parser LLM kecil + penjaga halusinasi
    ├── merge.ts                 gabung hasil LLM dan parser aturan
    ├── receiptParser.ts         parser aturan: teks OCR → item, pajak, total
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
