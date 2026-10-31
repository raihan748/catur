# ♞ C.A.T.U.R

Main catur langsung dengan temanmu, tanpa akun. Dua browser terhubung **peer-to-peer** (WebRTC):
langkah, jam, dan obrolan tidak melewati server kami. Situsnya statis dan di-hosting di Vercel.

## Fitur

- **Jadi Host / Gabung Ruangan** dengan kode 6 karakter (atau tautan `/r/<kode>`).
- Aturan catur lengkap (chess.js), papan dengan seret, ketuk, dan keyboard, plus animasi langkah.
- Jam dengan increment (tanpa jam, 3+2, 5+0, 10+0, 15+10), tawar remis, menyerah, batal, rematch.
- Tahan putus: permainan tersimpan di browser, tamu menyambung ulang sendiri, jam dijeda saat
  terputus, dan kemenangan bisa diklaim bila lawan tidak kembali dalam 60 detik.
- Obrolan, suara (bisa dibisukan), riwayat langkah, ekspor PGN, salin FEN.
- Mode **main berdua di satu perangkat** (`/lokal`), yang juga bisa dibuka offline.
- Bisa di-install sebagai aplikasi (PWA). Seluruh tampilan berbahasa Indonesia.

## Menjalankan di komputer

Perlu Node.js 20.19+ atau 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Server pengembangan dengan hot reload |
| `npm test` | Unit test (Vitest) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run build` | Type check + build produksi ke `dist/` |
| `npm run preview` | Sajikan `dist/` dengan header keamanan yang sama seperti di Vercel |

Untuk mencoba permainan online di satu komputer, buka dua tab: buat ruangan di tab pertama, lalu
masukkan kodenya di tab kedua.

## Cara kerja

```
Browser A  <== WebRTC DataChannel (langkah, jam, obrolan) ==>  Browser B
     \                                                          /
      \--- sinyal awal: server PeerJS publik + STUN Google ----/
                              |
             Vercel (hanya menyajikan file statis)
```

- **Host** mendaftarkan ID `catur-v1-<kode>` di server PeerJS publik (`0.peerjs.com`); **tamu**
  menyambung ke ID itu. Setelah tersambung, data mengalir langsung antar-browser.
- Hanya STUN, **tanpa TURN**: di sebagian jaringan (seluler/CGNAT, Wi-Fi kantor/kampus, VPN)
  koneksi langsung bisa gagal. Halaman `/tentang` berisi saran untuk pengguna.
- Protokol pesan ber-versi, divalidasi Zod, bernomor urut dengan ack, buang duplikat, dan heartbeat.
  Host adalah sumber kebenaran: tamu meminta `sync` setiap kali tersambung. Rinciannya ada di
  [PRD.md §8](PRD.md).

## Struktur

```
src/
  routes/        Halaman: Home, Room (online), Local, About, NotFound
  components/    Papan, jam, daftar langkah, riwayat, ekspor; online/ = layar permainan & obrolan
  game/          Aturan (engine.ts), permainan online (onlineGame.ts), jam, PGN, label teks
  net/           Transport (PeerJS), protokol (Zod), sesi (ack, heartbeat, sambung ulang), obrolan
  store/         Zustand: ruangan, simpanan per ruangan, permainan lokal, pengaturan
  styles/        Token warna (terang/gelap) dan gaya dasar
  utils/         Kode ruangan, storage, suara, salin/unduh
scripts/service-worker.js   Templat service worker (diisi saat build oleh vite.config.ts)
public/                     Favicon, ikon PWA, manifest
```

Dokumen perencanaan: [PRD.md](PRD.md), [design.md](design.md), [plan.md](plan.md).

## Deploy ke Vercel

1. Di dashboard Vercel: **Add New → Project → Import** repositori ini. Framework **Vite** terdeteksi
   otomatis (`npm run build`, output `dist`). Pengaturan juga ada di [vercel.json](vercel.json).
2. Setiap push ke `main` otomatis menjadi deploy produksi.
3. **Domain sendiri**: Project → **Settings → Domains → Add**, masukkan domainmu, lalu tambahkan
   record DNS yang diminta Vercel di pengelola domain. Biasanya `A 76.76.21.21` untuk domain utama
   dan `CNAME cname.vercel-dns.com` untuk subdomain, tetapi pakai nilai yang ditampilkan di dashboard.
   HTTPS dipasang otomatis setelah DNS terverifikasi (WebRTC memerlukan HTTPS).

Tidak ada environment variable yang dibutuhkan.

### Keamanan & cache

- `vercel.json` memasang CSP ketat: skrip hanya dari situs sendiri, koneksi hanya ke situs sendiri
  dan `0.peerjs.com`. `npm run preview` memakai header yang sama, jadi CSP bisa diuji sebelum deploy.
- Aset di `/assets/` (nama berisi hash) di-cache selamanya; `index.html` dan `sw.js` selalu dicek ulang.
- Service worker menyimpan cangkang aplikasi untuk offline. Versi baru aktif setelah semua tab lama
  ditutup.

## Batasan

- Tanpa server relay (TURN): tidak semua pasangan jaringan bisa terhubung.
- Bergantung pada server PeerJS publik untuk sinyal awal. Antarmuka `Transport` (`src/net/transport.ts`)
  memudahkan penggantian bila perlu.
- Jam "saling percaya": laporan jam lawan dibatasi agar tidak bisa menambah waktu, tetapi ini tetap
  permainan santai, bukan turnamen.
