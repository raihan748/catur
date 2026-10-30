# PRD — C.A.T.U.R (Catur Peer-to-Peer)

Versi: 1.0 · Tanggal: 2026-10-30 · Status: Draft

## 1. Ringkasan

C.A.T.U.R adalah website permainan catur online 1 lawan 1 yang berjalan **langsung antar-browser (peer-to-peer, WebRTC)**. Tidak ada server game, tidak ada akun, tidak ada database. Pemain membuat ruangan, membagikan tautan/kode, dan lawan langsung bisa bermain. Website di-hosting sebagai situs statis di **Vercel**.

## 2. Tujuan & Non-Tujuan

**Tujuan**
- Dua orang bisa bermain catur lengkap (aturan FIDE) lewat satu tautan, tanpa daftar/login.
- Biaya operasional mendekati nol (hosting statis Vercel; lalu lintas game tidak lewat server).
- Latensi rendah dan pengalaman nyaman di HP maupun desktop.
- Permainan tetap adil: aturan divalidasi di kedua sisi.

**Non-Tujuan (di luar MVP)**
- Akun, rating Elo, leaderboard, matchmaking publik.
- Bermain melawan AI/engine (kandidat fase 2).
- Spectator banyak orang, turnamen.
- Penyimpanan riwayat permainan di server.

## 3. Target Pengguna

- Teman/keluarga yang ingin main catur cepat tanpa instal aplikasi atau daftar akun.
- Pengguna HP (mayoritas) dan desktop, bahasa utama: Indonesia (opsional Inggris).

## 4. User Stories

1. Sebagai pengguna, saat membuka situs saya diberi dua pilihan: **Jadi Host** atau **Gabung Ruangan**.
2. Sebagai host, saya mendapat **kode ruangan** 6 karakter untuk dibagikan ke pemain 2 (tautan `/r/<kode>` tersedia sebagai jalan pintas).
3. Sebagai pemain 2, saya memasukkan kode ruangan di menu Gabung untuk langsung masuk ke permainan.
4. Sebagai host, saya bisa memilih warna (putih/hitam/acak) dan kontrol waktu sebelum kode dibuat.
4. Sebagai pemain, saya bisa menggerakkan bidak dengan drag-and-drop atau tap-tap, dengan sorotan langkah legal.
5. Sebagai pemain, saya bisa melihat jam, daftar langkah (SAN), dan bidak yang tertangkap.
6. Sebagai pemain, saya bisa menawarkan remis, menyerah, dan meminta ulang (rematch).
7. Sebagai pemain, jika koneksi putus saya bisa tersambung kembali ke permainan yang sama.
8. Sebagai pemain, saya bisa mengobrol singkat (chat) dengan lawan.
9. Sebagai pemain, saya bisa mengekspor permainan sebagai PGN.

## 5. Kebutuhan Fungsional

### 5.1 Lobi & Ruangan
- F1: Beranda menampilkan dua pilihan: **Jadi Host** dan **Gabung Ruangan**.
- F2: Jadi Host → sistem membuat kode ruangan acak (6 karakter alfanumerik, tanpa karakter ambigu 0/O/1/I) dan menampilkannya besar-besar; pemain 2 memasukkan kode itu di menu Gabung. Tautan `/r/<kode>` tersedia sebagai jalan pintas.
- F3: Ruangan maksimal 2 pemain; koneksi ketiga ditolak dengan pesan jelas.
- F4: Host memilih warna dan kontrol waktu (tanpa jam, 3+2, 5+0, 10+0, 15+10).
- F5: Status koneksi terlihat (menunggu lawan / terhubung / terputus / menyambung ulang).

### 5.2 Permainan Catur
- F6: Aturan lengkap: gerakan legal, rokade, en passant, promosi (pilih bidak), skak, skakmat, stalemate, remis karena bidak tidak cukup, aturan 50 langkah, pengulangan tiga kali.
- F7: Validasi langkah di **kedua** peer memakai library aturan yang sama; langkah ilegal dari lawan ditolak dan memicu resinkronisasi.
- F8: Jam catur dengan penambahan waktu (increment); kalah karena waktu habis.
- F9: Aksi: menyerah, tawar remis (terima/tolak), batalkan permainan sebelum langkah ke-2, rematch dengan tukar warna.
- F10: Riwayat langkah, navigasi ke posisi sebelumnya (hanya lihat), ekspor PGN, salin FEN.
- F11: Papan dapat dibalik (flip), highlight langkah terakhir, panah/tanda skak.
- F12: Efek suara (langkah, tangkap, skak, selesai) dengan tombol bisu.

### 5.3 Jaringan P2P
- F13: Koneksi WebRTC DataChannel antar dua browser; sinyal awal lewat layanan signaling publik.
- F14: Konfigurasi ICE: hanya STUN publik. **Tanpa TURN** pada MVP (keputusan pemilik proyek); jika koneksi langsung gagal, tampilkan pesan diagnosis dan saran ganti jaringan.
- F15: Protokol pesan ber-versi dan bernomor urut (lihat §8) dengan ack, deteksi duplikat, dan heartbeat (ping tiap 5 dtk, timeout 15 dtk).
- F16: Reconnect: simpan state permainan (FEN + PGN + sisa waktu + ID ruangan + peran) di `sessionStorage/localStorage`; saat sambung ulang, kedua peer menyamakan state (host sebagai sumber kebenaran sementara).
- F17: Chat teks (maks. 200 karakter, di-escape, tanpa HTML).

## 6. Kebutuhan Non-Fungsional

| Aspek | Target |
|---|---|
| Performa | First load < 150 KB gzip (JS), LCP < 2,5 dtk di 4G |
| Latensi langkah | < 300 ms pada koneksi normal |
| Kompatibilitas | Chrome, Edge, Firefox, Safari (iOS 15+/macOS) terbaru dan 2 versi sebelumnya |
| Responsif | 320 px s/d desktop; satu tangan di HP |
| Aksesibilitas | WCAG 2.1 AA: kontras, navigasi keyboard, label ARIA, dukungan `prefers-reduced-motion` |
| Keamanan | Tanpa eval, CSP ketat, input chat di-sanitasi, tidak ada data pribadi dikirim ke server kami |
| Privasi | Tanpa akun & tanpa pelacakan; analitik opsional (Vercel Web Analytics, tanpa cookie) |
| Ketersediaan | Mengikuti Vercel (statis); ketergantungan eksternal: server signaling & STUN |
| PWA | Dapat di-install, shell offline (permainan tetap butuh jaringan) |

## 7. Arsitektur Tingkat Tinggi

```
 Browser A  <== WebRTC DataChannel (langkah, jam, chat) ==>  Browser B
     \                                                          /
      \-- signaling awal (SDP/ICE) -- PeerJS Cloud / Trystero --/
                       |
         Vercel (hanya melayani file statis HTML/JS/CSS)
```

- **Frontend**: Vite + TypeScript + React (alternatif: Svelte/vanilla). Output statis ke `dist/`.
- **Aturan catur**: `chess.js` (validasi, PGN, FEN).
- **P2P**: `PeerJS` (WebRTC + signaling publik) untuk MVP. Alternatif tanpa server signaling sendiri: `Trystero`. Abstraksikan di balik antarmuka `Transport` agar mudah diganti.
- **Hosting**: Vercel (Static / Vite preset). `vercel.json` berisi rewrite SPA (`/r/*` → `/index.html`) dan header keamanan.
- **Catatan penting**: Vercel serverless **tidak mendukung WebSocket persisten**, sehingga server signaling sendiri tidak cocok di Vercel. Karena itu signaling memakai layanan publik (PeerJS Cloud) atau relay Nostr/BitTorrent (Trystero). Bila nanti butuh signaling sendiri, host terpisah (mis. Fly.io/Railway/Cloudflare Workers).

## 8. Protokol Pesan (v1)

Semua pesan JSON: `{ v:1, t:<tipe>, n:<nomor urut>, ts:<epoch ms>, d:<payload> }`

| Tipe | Arah | Payload |
|---|---|---|
| `hello` | keduanya | `{ name, clientId, sessionId, protocol }` |
| `reject` | host→tamu | `{ reason: 'full' \| 'version' }` |
| `sync` | host→tamu | `{ game, hostColor, timeControl, moves[], clocks, result }` — keadaan lengkap: jawaban `sync_request`, permainan baru, rematch, atau pemulihan |
| `sync_request` | tamu→host | `{}` — dikirim tamu setiap kali tersambung, dan saat posisi tidak cocok |
| `move` | keduanya | `{ game, ply, from, to, promotion?, san, clockMs }` |
| `ack` | keduanya | `{ n }` |
| `resign` / `abort` / `draw_offer` / `draw_accept` / `draw_decline` | keduanya | `{ game }` |
| `timeout` | keduanya | `{ game, color }` — diterima bila jam penerima juga ≤ 1,5 dtk |
| `abandon` | keduanya | `{ game }` — pengirim menang karena lawan terputus ≥ 60 dtk |
| `rematch_offer` / `rematch_accept` | keduanya | `{ game }` |
| `chat` | keduanya | `{ text }` (Fase 5) |
| `ping` / `pong` | keduanya | `{}` |

Aturan: pesan tidak dikenal diabaikan; payload divalidasi skema (mis. Zod) sebelum diproses.
Pesan kendali (`hello`, `reject`, `ack`, `ping`, `pong`) memakai `n = 0` dan tidak di-ack; pesan lain bernomor urut, di-ack, dan duplikat dibuang. `clientId` (per tab) mengenali tamu yang sama saat sambung ulang; `sessionId` (per muat halaman) mengatur ulang hitungan nomor urut. Pesan permainan membawa `game` (nomor permainan, naik tiap rematch) sehingga sisa pesan permainan lama diabaikan. Host adalah sumber kebenaran bila posisi kedua sisi berbeda.

Sambung ulang: tamu yang terputus mencoba lagi sendiri (jeda 1 → 10 dtk). Saat tersambung, pesan yang tertunda dikirim lebih dulu, lalu tamu mengirim `sync_request`; jadi `sync` balasan host sudah memuat aksi yang dilakukan selama terputus (mis. menyerah). Keadaan permainan disimpan di `localStorage` per ruangan, sehingga host maupun tamu bisa memuat ulang atau menutup tab lalu melanjutkan. Host yang dipulihkan hanya menerima `clientId` tamu yang lama.

## 9. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| NAT ketat / jaringan seluler gagal P2P | Tidak bisa terhubung | Pesan diagnosis + saran ganti jaringan (Wi-Fi ↔ seluler); TURN jadi opsi masa depan bila banyak yang gagal |
| Server signaling publik down | Tidak bisa membuat ruangan | Abstraksi `Transport`, fallback ke Trystero; tampilkan status |
| Curang (modifikasi klien/jam) | Tidak adil | Validasi dua sisi; jam bersifat "tepercaya-sama-sama", ditampilkan selisih; ini game kasual |
| Tab di-background di iOS memutus koneksi | Putus tengah main | Reconnect otomatis + sinkronisasi state |
| Latensi memengaruhi jam | Selisih waktu | Kompensasi dengan timestamp & sinkronisasi periodik |

## 10. Metrik Keberhasilan

- ≥ 90% ruangan berhasil terhubung dalam < 10 dtk.
- ≥ 85% permainan selesai tanpa putus permanen.
- Lighthouse Performance/Accessibility ≥ 90.
- Waktu dari buka situs ke langkah pertama < 30 dtk.

## 11. Rencana Rilis

- **MVP (v0.1)**: F1–F11, F13–F15, tanpa chat/PWA.
- **v0.2**: reconnect (F16), chat, suara, PWA, PGN.
- **v0.3**: tema papan, bahasa Inggris, analisis sederhana (Stockfish WASM, opsional), main vs komputer.

## 12. Pertanyaan Terbuka

Sudah diputuskan:
- Bahasa UI: **Bahasa Indonesia saja** (tanpa i18n/EN).
- Domain: sudah dimiliki pengguna, akan dipasang di Vercel.
- Tanpa TURN pada MVP.
- Alur masuk: pilihan Host / Gabung dengan kode ruangan.

Masih terbuka:
1. Perlu mode spectator di v0.3?
