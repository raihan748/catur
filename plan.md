# Rencana Implementasi — C.A.T.U.R

Acuan: [PRD.md](PRD.md) dan [design.md](design.md). Estimasi untuk 1 developer, paruh waktu; satuan hari kerja (hk).

## Keputusan Teknis

| Hal | Pilihan | Alasan |
|---|---|---|
| Build | Vite + TypeScript | Cepat, output statis cocok untuk Vercel |
| UI | React 18 | Ekosistem luas; Svelte/vanilla juga layak |
| Aturan catur | `chess.js` | Teruji, mendukung PGN/FEN |
| P2P | `PeerJS` di balik antarmuka `Transport` | Paling cepat untuk MVP; mudah diganti ke Trystero |
| State | Zustand | Ringan |
| Validasi pesan | Zod | Pesan lawan tidak dipercaya |
| Test | Vitest + Playwright (2 konteks browser untuk uji P2P) | Mencakup unit dan e2e |
| Hosting | Vercel (static) | Sesuai permintaan |

## Fase 0 — Setup (0,5 hk)
- [ ] `npm create vite@latest . -- --template react-ts`
- [ ] Pasang dependensi: `chess.js peerjs zustand zod`, dev: `vitest @playwright/test`
- [ ] ESLint + Prettier, `tsconfig` strict
- [ ] `git init`, `.gitignore`, repo GitHub
- [ ] Hubungkan ke Vercel (Import Project) → deploy pertama otomatis tiap push
- [ ] Tambah `vercel.json` (rewrite SPA + header keamanan)

**Selesai bila**: halaman kosong tampil di URL `*.vercel.app` dan refresh di `/r/abc` tidak 404.

## Fase 1 — Papan & Aturan Lokal (3 hk)
- [ ] `tokens.css` + tema terang/gelap
- [ ] `game/engine.ts`: bungkus chess.js (`tryMove`, `legalMovesFrom`, `status`)
- [ ] Komponen `Board` + `Piece` (SVG), flip, koordinat
- [ ] Tap-tap dan drag (Pointer Events), highlight legal & langkah terakhir
- [ ] `PromotionPicker`
- [ ] `MoveList`, `CapturedPieces`
- [ ] Mode "hot-seat" lokal untuk menguji aturan
- [ ] Unit test engine: rokade, en passant, promosi, skakmat, stalemate, 3x repetisi, 50 langkah

**Selesai bila**: dua orang bisa menamatkan satu permainan di satu perangkat tanpa bug aturan.

## Fase 2 — Koneksi P2P (3 hk)
- [ ] `net/transport.ts` (antarmuka) + `PeerJsTransport`
- [ ] `utils/roomId.ts` (6 karakter, alfabet tanpa ambigu, prefix proyek)
- [ ] Beranda: dua pilihan **Jadi Host** / **Gabung Ruangan**
- [ ] Alur host: pengaturan (warna, waktu) → buat kode → layar tunggu (kode besar, salin, Web Share)
- [ ] Alur tamu: input kode di menu Gabung (atau buka `/r/:kode`) → connect; kode salah → pesan galat
- [ ] Tolak koneksi ketiga ("Ruangan penuh")
- [ ] `net/protocol.ts`: skema Zod, nomor urut, `ack`, dedup
- [ ] Heartbeat ping/pong, deteksi putus (15 dtk)
- [ ] Handshake `hello` + `start` (warna, kontrol waktu, FEN awal)
- [ ] Konfigurasi ICE (hanya STUN, tanpa TURN)

**Selesai bila**: dua tab/dua perangkat berbeda jaringan terhubung dan bertukar `hello`.

## Fase 3 — Permainan Online (3 hk)
- [ ] Sambungkan `Board` ke store + transport: kirim/terima `move`
- [ ] Validasi ulang langkah lawan; `sync` bila tidak cocok
- [ ] Kunci papan: hanya giliran sendiri & warna sendiri
- [ ] Jam (performance.now), increment, timeout, sinkronisasi saat `move`
- [ ] Aksi: menyerah (konfirmasi), tawar/terima/tolak remis, batal awal permainan
- [ ] Modal hasil + rematch (tukar warna)
- [ ] Status bar koneksi, toast
- [ ] E2E Playwright: dua konteks memainkan *Fool's mate* sampai skakmat

**Selesai bila**: permainan lengkap host vs tamu berjalan sampai selesai dengan semua jenis hasil.

## Fase 4 — Ketahanan (2 hk)
- [ ] Simpan snapshot (FEN, PGN, jam, ID ruangan, peran) ke `localStorage`
- [ ] Reconnect otomatis dengan backoff; tamu & host saling `sync`
- [ ] Batas waktu 60 dtk → hasil `abandoned` / opsi tunggu
- [ ] Tangani tab background (Page Visibility) & `beforeunload`
- [ ] Pesan diagnosis P2P gagal + halaman `/tentang` (bantuan koneksi)
- [ ] Uji: matikan Wi-Fi 20 dtk, refresh tab, tutup-buka tab

**Selesai bila**: refresh/putus sementara tidak menghilangkan permainan.

## Fase 5 — Poles & Fitur Tambahan (3 hk)
- [ ] Chat (200 karakter, di-escape) + badge belum dibaca
- [ ] Suara (langkah/tangkap/skak/selesai) + tombol bisu
- [ ] Ekspor PGN, salin FEN, navigasi riwayat ◀▶
- [ ] Aksesibilitas: keyboard, ARIA, `aria-live`, reduced motion
- [ ] Responsif (320 px → desktop), uji iOS Safari & Android Chrome
- [ ] PWA (manifest, ikon, service worker via `vite-plugin-pwa`)
- [ ] Semua teks UI Bahasa Indonesia (`<html lang="id">`), tanpa i18n

**Selesai bila**: Lighthouse Performance & Accessibility ≥ 90; checklist QA di design.md §10 lulus.

## Fase 6 — Rilis (1 hk)
- [ ] Domain kustom di Vercel + HTTPS
- [ ] Verifikasi CSP tidak memblokir PeerJS/STUN di produksi
- [ ] Vercel Web Analytics (opsional, tanpa cookie)
- [ ] Tes lintas jaringan (Wi-Fi ↔ seluler) dengan teman
- [ ] README: cara menjalankan, struktur, cara deploy
- [ ] Tag `v0.1.0`

## Total Estimasi

~13,5 hk (±3 minggu paruh waktu). MVP (Fase 0–3) ≈ 9,5 hk.

## Perintah Deploy Vercel

```bash
npm i -g vercel
vercel login
vercel          # preview
vercel --prod   # produksi
```

Atau cukup *Import Git Repository* di dashboard Vercel: framework **Vite**, build `npm run build`, output `dist`.

## Risiko Utama & Tindakan Awal

1. **P2P gagal di jaringan seluler/NAT ketat** → tanpa TURN; mitigasi berupa pesan diagnosis + bantuan di `/tentang`. Pertimbangkan TURN hanya jika banyak yang gagal.
2. **Ketergantungan server signaling publik PeerJS** → jaga antarmuka `Transport` agar bisa ganti ke Trystero.
3. **Safari iOS memutus koneksi saat background** → prioritaskan Fase 4 dan uji di perangkat nyata sejak Fase 2.

## Langkah Berikutnya

1. Keputusan sudah final: UI Indonesia, domain sudah ada, tanpa TURN, alur Host/Gabung dengan kode.
2. Jalankan Fase 0 (setup proyek + deploy pertama ke Vercel).
