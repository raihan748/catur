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
- [x] `tokens.css` + tema terang/gelap
- [x] `game/engine.ts`: bungkus chess.js (`tryMove`, `legalTargets`, `result`, `snapshot`)
- [x] Komponen `Board` + `Piece` (SVG buatan sendiri), flip, koordinat
- [x] Tap-tap, drag (Pointer Events), keyboard; highlight legal, langkah terakhir & skak
- [x] `PromotionPicker`
- [x] `MoveList`, `CapturedPieces`, `PlayerBar`
- [x] Mode "hot-seat" lokal di `/lokal` (dengan putar otomatis)
- [x] Unit test engine: rokade, en passant, promosi, skakmat, stalemate, 3x repetisi, 50 langkah
- [ ] Animasi gerak bidak 150 ms (dipindah ke Fase 5)

**Selesai bila**: dua orang bisa menamatkan satu permainan di satu perangkat tanpa bug aturan.

## Fase 2 — Koneksi P2P (3 hk)
- [x] `net/transport.ts` (antarmuka) + `net/peerjs.ts` (`PeerJsTransport`)
- [x] `utils/roomCode.ts` (6 karakter, alfabet tanpa ambigu); prefix ID `catur-v1-`
- [x] Beranda: dua pilihan **Jadi Host** / **Gabung Ruangan**
- [x] Alur host: pengaturan (warna, waktu) → buat kode → layar tunggu (kode besar, salin, Web Share)
- [x] Alur tamu: input kode di menu Gabung (atau buka `/r/:kode`) → connect; kode salah → pesan galat
- [x] Tolak koneksi ketiga ("Ruangan penuh"); tamu yang sama (clientId) boleh sambung ulang
- [x] `net/protocol.ts`: skema Zod; `net/session.ts`: nomor urut, `ack`, dedup
- [x] Heartbeat ping/pong, deteksi putus (15 dtk)
- [x] Handshake `hello` + `start` (warna, kontrol waktu, FEN awal)
- [x] Konfigurasi ICE (hanya STUN, tanpa TURN)
- [x] Code-splitting rute permainan agar beranda < 150 KB gzip

**Selesai bila**: dua tab/dua perangkat berbeda jaringan terhubung dan bertukar `hello`.

## Fase 3 — Permainan Online (3 hk)
- [x] `game/onlineGame.ts` (tanpa React) + `store/roomStore.ts`: kirim/terima `move`
- [x] Validasi ulang langkah lawan; host mengirim `sync` (tamu meminta `sync_request`) bila tidak cocok
- [x] Kunci papan: hanya giliran sendiri, warna sendiri, dan saat tersambung
- [x] Jam (performance.now), increment, timeout (+ remis bila pemenang tak punya bahan skakmat), jam dijeda saat terputus
- [x] Aksi: menyerah (konfirmasi dua langkah), tawar/terima/tolak remis, batal sebelum langkah ke-2
- [x] Dialog hasil + rematch (tukar warna)
- [x] Banner koneksi, toast
- [x] Tamu muat ulang di tengah permainan → posisi & jam dipulihkan lewat `sync`
- [x] Uji dua pemain: 18 test `OnlineGame` (termasuk *Fool's mate*) + uji manual dua tab
- [ ] E2E Playwright dua konteks (ditunda: perlu unduh browser Playwright dan server PeerJS publik)

**Selesai bila**: permainan lengkap host vs tamu berjalan sampai selesai dengan semua jenis hasil.

## Fase 4 — Ketahanan (2 hk)
- [x] Simpan permainan (langkah, jam, peran, kode, clientId, nama) ke `localStorage` per ruangan (`store/savedRooms.ts`); Web Locks mencegah dua tab di browser yang sama berebut simpanan
- [x] Reconnect otomatis tamu dengan backoff (1 → 10 dtk); host yang dipulihkan mengingat tamunya; tamu meminta `sync` setiap kali tersambung (setelah pesan tertunda terkirim)
- [x] Batas waktu 60 dtk → klaim kemenangan (`abandoned`), atau batal bila belum ada dua langkah; boleh terus menunggu
- [x] Tangani tab background (Page Visibility, `pagehide`, deteksi timer tertidur) & `beforeunload` selama bermain
- [x] Pesan diagnosis P2P gagal + halaman `/tentang` (bantuan koneksi) + kartu "Lanjutkan" di beranda
- [x] Uji: 9 test baru (sesi & `OnlineGame`) + uji manual dua tab: refresh host, refresh tamu, tutup-buka tab, klaim setelah 60 dtk, rematch
- [ ] Uji matikan Wi-Fi 20 dtk di perangkat nyata (belum; heartbeat & sambung ulang sudah diuji lewat test)

**Selesai bila**: refresh/putus sementara tidak menghilangkan permainan.

## Fase 5 — Poles & Fitur Tambahan (3 hk)
- [x] Chat (200 karakter, dibersihkan, selalu tampil sebagai teks) + badge belum dibaca; tersimpan bersama permainan
- [x] Suara (langkah/tangkap/skak/selesai/pesan) disintesis Web Audio, tanpa file + tombol bisu (tersimpan)
- [x] Ekspor PGN (salin/unduh), salin FEN posisi yang dilihat, navigasi riwayat « ‹ › » (tombol, klik langkah, ←/→/Home/End)
- [x] Animasi gerak bidak 150 ms (dipindah dari Fase 1); dilewati untuk bidak yang diseret & `prefers-reduced-motion`
- [x] Aksesibilitas: label & `aria-live` untuk obrolan, riwayat, ekspor; fokus tidak hilang di ujung riwayat
- [x] Responsif 320 px → desktop tanpa scroll horizontal (diuji di browser)
- [ ] Uji iOS Safari & Android Chrome di perangkat nyata
- [x] PWA: manifest, ikon PNG (digambar dari bidak kuda proyek), service worker buatan sendiri lewat plugin Vite kecil (`scripts/service-worker.js`) alih-alih `vite-plugin-pwa`; cangkang offline diuji
- [x] Semua teks UI Bahasa Indonesia (`<html lang="id">`), tanpa i18n
- [ ] Lighthouse (belum dijalankan)

**Selesai bila**: Lighthouse Performance & Accessibility ≥ 90; checklist QA di design.md §10 lulus.

## Fase 6 — Rilis (1 hk)
- [ ] Domain kustom di Vercel + HTTPS (langkahnya di README; dilakukan pemilik di dashboard Vercel & DNS)
- [x] Verifikasi CSP: `npm run preview` kini memakai header dari `vercel.json`; host + tamu, langkah, obrolan, service worker, dan manifest berjalan tanpa satu pun pelanggaran CSP
- [ ] Cek ulang CSP & koneksi di domain produksi setelah deploy
- [ ] Vercel Web Analytics (opsional, tanpa cookie) — belum dipasang, menunggu keputusan pemilik
- [ ] Tes lintas jaringan (Wi-Fi ↔ seluler) dengan teman
- [x] README: cara menjalankan, cara kerja, struktur, cara deploy & domain
- [x] Meta pratinjau tautan (Open Graph) dan versi `0.1.0` di package.json
- [x] Tag `v0.1.0`

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

1. Pasang domain di Vercel, lalu cek ulang CSP & koneksi di produksi.
2. Uji di perangkat nyata: iOS Safari & Android Chrome, Wi-Fi ↔ seluler, matikan Wi-Fi 20 dtk.
3. Jalankan Lighthouse (mis. PageSpeed Insights) di domain produksi; target ≥ 90.
4. Kandidat v0.2/v0.3 (PRD §11): tema papan, analisis/engine, main vs komputer, TURN bila banyak yang gagal terhubung.
