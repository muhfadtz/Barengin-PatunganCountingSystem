# Barengin — Patungan tanpa ribut

Aplikasi split bill client-side: Vue 3 + TypeScript + Vite + Tailwind CSS v4, scan struk dengan Gemini (model multimodal, Google AI Studio).
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

- **Satu sesi, tanpa penyimpanan**: tidak ada riwayat dan tidak ada `localStorage`/`sessionStorage`/cookie. Data hanya di memori dan hilang saat halaman di-refresh (browser akan memberi peringatan bila sudah ada item). Tombol "Sesi baru" menghapus semuanya.
- Mulai sesi → **upload banyak struk sekaligus** (dibaca Gemini) → hasilnya jadi daftar item, atau catat manual lewat **Tambah item**
- Di daftar item, atur per item siapa yang bayar dan dibagi ke siapa; pembagian custom/satu orang tersedia dari form manual
- Pilihan 2 orang (mis. Gue & Dia) berupa tombol langsung, bukan dropdown; panel anggota ringkas (tumpukan avatar) dan form tambah item tersembunyi secara default
- Pajak/service/diskon, pembulatan largest remainder (total selalu pas)
- Saldo bersih per orang + rekomendasi transfer, salin ringkasan ke WhatsApp

## Scan struk (Gemini)

Foto struk atau screenshot pesanan dikirim langsung ke [Gemini](https://ai.google.dev/) (model multimodal), tanpa tahap OCR terpisah. Satu panggilan mengembalikan item, qty, subtotal, pajak/service/diskon, dan total sebagai JSON terstruktur (`responseSchema`).

```bash
cp .env.example .env     # isi GEMINI_API_KEY (dari https://aistudio.google.com/apikey)
npm run dev              # restart setelah mengubah .env
```

`GEMINI_API_KEY` **tidak** berawalan `VITE_`, jadi hanya dibaca server Vite dan tidak masuk ke JavaScript browser. Browser memanggil `/api/gemini/...`; proxy Vite menambahkan key.

> Proxy ini aktif di `npm run dev` dan `npm run preview`. Untuk deploy publik perlu proxy/backend sendiri yang meneruskan `/api/gemini` ke Google dengan key di sisi server.

- **Model:** default `gemini-3.6-flash`; jika tidak ditemukan (404) otomatis jatuh ke `gemini-2.5-flash`. Paksa satu model lewat `VITE_GEMINI_MODEL`.
- **Cek total:** kalau total di struk berbeda dari jumlah item + pajak, baris struk diberi peringatan. Selalu periksa hasilnya sebelum membagi.
- **Kuota:** free tier punya batas permintaan per menit/hari; saat terlampaui app menampilkan pesan agar mencoba lagi.
- **Privasi:** gambar struk dikirim ke Google untuk diproses.

## Struktur

```text
src/
├── App.vue                      satu sesi (in-memory)
├── style.css                    token Pinterest Light + komponen
├── components/
│   ├── BarenginLogo.vue
│   ├── SessionStart.vue         nama sesi + anggota, tombol Mulai
│   ├── ReceiptBulkUpload.vue    upload banyak struk → Gemini → item
│   ├── ExpenseList.vue          daftar item (editable / read-only)
│   ├── ExpenseForm.vue          form tambah manual (tersembunyi default)
│   ├── SplitSelector.vue        equal / exclusive / custom
│   ├── ResultPanel.vue          saldo, transfer, salin WhatsApp
│   ├── BaseSelect.vue           dropdown custom (2 opsi → tombol segmented)
│   └── MemberAvatar.vue
└── lib/
    ├── split.ts                 allocate, computeShares, balances, settle
    ├── gemini.ts                baca struk via Gemini + normalisasi hasil
    ├── whatsapp.ts              ringkasan WhatsApp
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
