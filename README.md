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

> Di dev, proxy ini ada di `vite.config.ts` (aktif di `npm run dev` / `npm run preview`). Di produksi (Vercel) perannya dipegang fungsi serverless `api/gemini.ts`, lihat bagian Deploy.

- **Model:** dipilih otomatis. App menanyakan ke Google model apa saja yang tersedia untuk key-mu (`GET /v1beta/models`), lalu memakai model Flash stabil terbaru yang bisa membaca gambar (fallback ke berikutnya bila 404). Paksa satu model lewat `VITE_GEMINI_MODEL` hanya jika perlu; nama yang salah membuat scan gagal.
- **Cek total:** kalau total di struk berbeda dari jumlah item + pajak, baris struk diberi peringatan. Selalu periksa hasilnya sebelum membagi.
- **Kuota:** struk diproses satu per satu. Saat kena batas per menit (429) app menunggu sesuai saran Google lalu mencoba lagi otomatis; kuota harian habis → berhenti dengan pesan jelas. Kalau tetap sering kena batas, pakai model lain lewat `VITE_GEMINI_MODEL` (mis. varian flash-lite) atau key dengan kuota lebih besar.
- **Privasi:** gambar struk dikirim ke Google untuk diproses.

## Deploy ke Vercel

1. Import repo di Vercel (framework Vite terdeteksi otomatis; `vercel.json` hanya mengatur batas waktu fungsi).
2. Di *Settings → Environment Variables* tambahkan `GEMINI_API_KEY` (Production dan Preview), lalu **redeploy**. Tanpa ini, scan struk menampilkan pesan bahwa key belum diatur.
3. Fungsi `api/gemini.ts` (dengan `rewrites` di `vercel.json`: `/api/gemini/*` → fungsi itu) menyimpan key di server dan hanya meneruskan `POST v1beta/models/<model>:generateContent` dan `GET v1beta/models` (daftar model) dari origin yang sama.
4. **Cek cepat:** buka `https://<domain-kamu>/api/gemini` di browser. Harus tampil `{"ok":true,"proxy":"barengin","keyConfigured":true}`. `keyConfigured:false` berarti `GEMINI_API_KEY` belum terbaca (isi lalu redeploy); 404 berarti fungsi belum ter-deploy. Key tidak pernah masuk ke bundle browser.

> **Perhatian:** siapa pun yang membuka situs bisa memakai kuota Gemini milikmu lewat proxy ini. Untuk membatasinya aktifkan *Deployment Protection* (Vercel Authentication / password) di pengaturan proyek, atau tambahkan autentikasi sendiri sebelum dibagikan.

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
