# Design — C.A.T.U.R

Dokumen desain UI/UX dan desain teknis. Pasangan dari [PRD.md](PRD.md).

## 1. Prinsip Desain

1. **Papan adalah bintangnya** — papan menempati ruang terbesar, kontrol lain minimal.
2. **Nol gesekan** — dari buka situs ke main maksimal 2 ketukan.
3. **Satu tangan** — semua aksi utama terjangkau ibu jari di HP.
4. **Tenang & jelas** — warna lembut, kontras tinggi, tanpa gangguan visual.

## 2. Design Tokens

Didefinisikan sebagai CSS variables di `:root`, dengan override untuk mode gelap (`prefers-color-scheme: dark` + toggle manual).

### Warna

| Token | Terang | Gelap | Kegunaan |
|---|---|---|---|
| `--bg` | `#F6F4EF` | `#16181C` | Latar halaman |
| `--surface` | `#FFFFFF` | `#1F2227` | Kartu/panel |
| `--text` | `#1B1D21` | `#ECEAE4` | Teks utama |
| `--text-muted` | `#5E636B` | `#A3A8B0` | Teks sekunder |
| `--primary` | `#2F6F5E` | `#52B596` | Tombol utama, fokus |
| `--primary-contrast` | `#FFFFFF` | `#0E1A16` | Teks di atas primary |
| `--danger` | `#B3372F` | `#E5675E` | Menyerah, skak |
| `--board-light` | `#EEEED2` | `#D7D9C2` | Kotak terang |
| `--board-dark` | `#6A8F5B` | `#4F6F47` | Kotak gelap |
| `--hl-last` | `rgba(255,214,0,.40)` | `rgba(255,214,0,.30)` | Langkah terakhir |
| `--hl-legal` | `rgba(20,20,20,.22)` | `rgba(255,255,255,.28)` | Titik langkah legal |
| `--hl-check` | `radial-gradient(#E5484D, transparent 70%)` | sama | Raja skak |

Semua pasangan teks/latar ≥ 4.5:1 (UI ≥ 3:1). Status tidak hanya dibedakan lewat warna (tambahkan ikon/teks).

### Tipografi
- UI: `Inter`, fallback `system-ui, sans-serif`. Angka jam: `Inter` dengan `font-variant-numeric: tabular-nums`.
- Notasi langkah: `JetBrains Mono` / `ui-monospace`.
- Skala: 12 / 14 / 16 / 20 / 28 / 40 px; body 16 px, line-height 1.5.

### Spasi, Radius, Bayangan
- Skala spasi 4 px: 4, 8, 12, 16, 24, 32, 48.
- Radius: 8 px (kontrol), 12 px (kartu), 4 px (papan).
- Bayangan kartu: `0 1px 2px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)`.

### Gerak
- Animasi langkah bidak 150 ms `ease-out`; transisi UI 120–200 ms.
- Hormati `prefers-reduced-motion` (matikan animasi non-esensial).

## 3. Peta Halaman

```
/            Beranda (buat / gabung ruangan)
/r/:id       Ruangan & permainan
/tentang     Cara kerja P2P, privasi, bantuan koneksi
*            404 (SPA fallback ke beranda)
```

## 4. Layout & Wireframe

### 4.1 Beranda `/`

```
┌──────────────────────────────┐
│  ♞ C.A.T.U.R              ☾  │
├──────────────────────────────┤
│   Main catur langsung dengan │
│   temanmu. Tanpa akun.       │
│                              │
│  ┌────────────────────────┐  │
│  │  Jadi Host             │  │
│  │  Buat ruangan, dapat   │  │
│  │  kode untuk lawanmu    │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  Gabung Ruangan        │  │
│  │  Punya kode? Masukkan  │  │
│  └────────────────────────┘  │
│                              │
│  Cara kerja · Privasi        │
└──────────────────────────────┘
```

- **Jadi Host** → dialog: warna (Putih / Hitam / Acak), kontrol waktu (chip), nama panggilan (opsional) → tombol **Buat Ruangan** → layar tunggu berisi kode besar (mis. `K7M2QX`), tombol Salin/Bagikan.
- **Gabung Ruangan** → input kode 6 karakter (otomatis huruf besar, validasi format), nama panggilan (opsional) → tombol **Gabung**. Kode salah/tidak ditemukan → pesan galat inline.

### 4.2 Ruangan — Mobile (portrait)

```
┌──────────────────────────────┐
│ Lawan: Budi  ● terhubung  ⋯  │
│ ♟♟♞ (tertangkap)       05:00 │
├──────────────────────────────┤
│                              │
│        PAPAN 8×8             │
│      (lebar penuh, 1:1)      │
│                              │
├──────────────────────────────┤
│ Kamu                  04:42  │
│ ♙♙ (tertangkap)              │
├──────────────────────────────┤
│ 1. e4 e5  2. Nf3 Nc6 ...     │  ← strip langkah (scroll horizontal)
├──────────────────────────────┤
│ [½ Remis] [⚑ Menyerah] [💬]  │
└──────────────────────────────┘
```

### 4.3 Ruangan — Desktop (≥ 960 px)

```
┌─────────────────────────────────────────────┐
│ Header                                      │
├───────────────────────┬─────────────────────┤
│  Lawan + jam          │  Panel samping      │
│ ┌───────────────────┐ │  ┌───────────────┐  │
│ │      PAPAN        │ │  │ Daftar langkah│  │
│ │   (maks 640 px)   │ │  │ + navigasi ◀▶ │  │
│ └───────────────────┘ │  ├───────────────┤  │
│  Kamu + jam           │  │ Chat          │  │
│                       │  ├───────────────┤  │
│                       │  │ Aksi: remis,  │  │
│                       │  │ menyerah, flip│  │
└───────────────────────┴─────────────────────┘
```

Breakpoint: `< 640` mobile, `640–959` tablet (panel di bawah), `≥ 960` desktop dua kolom.

### 4.4 Layar "Menunggu Lawan"

Papan tampil redup di latar; kartu di tengah berisi: tautan (tombol salin), kode besar (mis. `K7M2QX`), tombol Bagikan (Web Share API), indikator berputar "Menunggu lawan…", tautan batal.

## 5. Komponen

| Komponen | Keterangan |
|---|---|
| `Board` | Render 64 kotak via CSS grid; bidak SVG; koordinat a–h/1–8; mendukung drag (Pointer Events) dan tap-tap; flip |
| `Piece` | SVG set open-license (mis. cburnett/lichess "cburnett" atau "merida") |
| `MoveHints` | Titik di kotak legal, cincin pada kotak tangkapan |
| `PromotionPicker` | Popover 4 pilihan (Q/R/B/N) di atas kotak tujuan |
| `Clock` | Menampilkan mm:ss, <10 dtk tampilkan desimal & warna `--danger`; aktif = bingkai `--primary` |
| `MoveList` | Pasangan langkah SAN, langkah aktif disorot, klik untuk melihat posisi lama |
| `CapturedPieces` | Bidak tertangkap + selisih materi (+3) |
| `StatusBar` | Status koneksi, giliran, skak |
| `ActionBar` | Remis, menyerah (konfirmasi), flip, suara |
| `Chat` | Daftar pesan + input; badge belum dibaca |
| `Modal` | Hasil permainan (menang/kalah/remis + alasan), rematch, ekspor PGN |
| `Toast` | Info singkat: "Lawan menawarkan remis", "Tautan disalin" |

## 6. Interaksi Papan

- **Tap-tap**: ketuk bidak → tampil langkah legal → ketuk tujuan. Ketuk bidak sendiri lain = ganti pilihan.
- **Drag**: bidak mengikuti pointer, kotak asal redup, snap ke kotak terdekat; lepas di luar papan = batal.
- **Premove** (v0.3): satu langkah antrean saat giliran lawan.
- Hanya bidak pemain yang bisa digerakkan, hanya saat gilirannya, dan hanya saat koneksi `connected` (atau sedang menyambung ulang → langkah dikunci).
- Papan menghadap warna pemain secara default.
- Keyboard: Tab ke papan → panah menggerakkan kursor kotak, Enter pilih/lepas, Esc batal. Setiap kotak punya `aria-label` ("e2, pion putih").
- Pembacaan layar: area `aria-live="polite"` mengumumkan langkah lawan ("Lawan memindahkan kuda ke f3").

## 7. State Aplikasi

State machine koneksi:

```
Host:  idle → creating → waiting → connected ⇄ disconnected (tamu putus; menunggu tamu yang sama)
Tamu:  idle → connecting → connected ⇄ reconnecting (coba lagi sendiri, jeda 1 → 10 dtk)
Galat fatal (penuh, versi, browser tidak didukung, ruangan tidak ada saat pertama masuk) → error
```

Selama terputus jam dijeda. Setelah 60 dtk pemain yang menunggu boleh mengklaim kemenangan (`abandoned`) atau membatalkan permainan bila belum ada dua langkah, atau terus menunggu. Muat ulang halaman atau buka lagi tab yang tertutup memulihkan permainan dari `localStorage`.

State permainan (`GameState`):

```ts
type GameState = {
  fen: string;
  pgn: string;
  turn: 'w' | 'b';
  myColor: 'w' | 'b';
  clocks: { w: number; b: number };      // ms tersisa
  status: 'waiting' | 'playing' | 'over';
  result?: { winner?: 'w' | 'b'; reason:
    'checkmate' | 'resign' | 'timeout' | 'stalemate' |
    'insufficient' | 'repetition' | '50move' | 'agreement' | 'abandoned' };
  drawOffer?: 'me' | 'them';
};
```

Penyimpanan klien: Zustand (atau reducer) + `localStorage` untuk preferensi (tema, suara, nama) dan snapshot permainan untuk reconnect.

## 8. Desain Teknis

### 8.1 Struktur Proyek

```
projek C.A.T.U.R/
├─ index.html
├─ vite.config.ts
├─ vercel.json
├─ package.json
├─ public/            # ikon PWA, bidak SVG, suara
└─ src/
   ├─ main.tsx
   ├─ routes/         # Home.tsx, Room.tsx, About.tsx
   ├─ components/     # Board, Clock, MoveList, Chat, ...
   ├─ game/           # engine.ts (bungkus chess.js), clock.ts, types.ts
   ├─ net/            # transport.ts (antarmuka), peerjs.ts, protocol.ts, session.ts
   ├─ store/          # game store, settings store
   ├─ styles/         # tokens.css, global.css
   └─ utils/          # roomId.ts, pgn.ts, sound.ts
```

### 8.2 Antarmuka Transport

```ts
interface Transport {
  host(roomId: string): Promise<void>;
  join(roomId: string): Promise<void>;
  send(msg: Message): void;
  on(event: 'open' | 'message' | 'close' | 'error', cb: (...a: any[]) => void): void;
  close(): void;
}
```

Implementasi `PeerJsTransport` memakai `new Peer(<prefix>-<roomId>)` untuk host; tamu `peer.connect(<prefix>-<roomId>, { reliable: true })`. Prefix unik proyek mencegah tabrakan ID di server publik.

### 8.3 Alur Langkah

1. Pemain menjatuhkan bidak → `engine.tryMove()` memvalidasi lokal.
2. Jika sah: update state, jalankan animasi, kirim `move` (dengan `n` & sisa jam).
3. Peer lawan menerima → validasi dengan engine sendiri → terapkan & kirim `ack`.
4. Tanpa `ack` dalam 3 dtk → kirim ulang; setelah 3 kali gagal → status `reconnecting`.
5. Jika langkah ilegal/di luar giliran → abaikan & kirim `sync` untuk menyamakan state.

### 8.4 Jam

- Dihitung dari `performance.now()` pada tiap klien; bukan interval kumulatif (hindari drift).
- Tiap `move` membawa sisa jam pengirim; penerima menyesuaikan sisa jam lawan.
- Klien yang waktunya habis mengumumkan `timeout`; penerima memverifikasi terhadap jam lokalnya (toleransi 1 dtk).

### 8.5 Konfigurasi ICE

```ts
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
```

> TURN tidak dipakai di MVP. Jika koneksi langsung gagal, UI menampilkan pesan diagnosis (lihat §9).

### 8.6 Deployment Vercel

`vercel.json`:

```json
{
  "rewrites": [{ "source": "/r/:id", "destination": "/index.html" },
               { "source": "/tentang", "destination": "/index.html" }],
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
      { "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' wss://0.peerjs.com https://0.peerjs.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'" }
    ]
  }]
}
```

- Framework preset: Vite · Build: `npm run build` · Output: `dist`.
- WebRTC butuh **HTTPS** — Vercel menyediakannya otomatis (localhost juga diizinkan).
- Aset hasil build di-cache `immutable`; `index.html` tidak di-cache.
- Tidak ada environment variable yang dibutuhkan pada MVP.

## 9. Teks UI (ID) — Contoh

| Konteks | Teks |
|---|---|
| Hero | "Main catur langsung dengan temanmu. Tanpa akun." |
| Tunggu | "Bagikan tautan ini ke lawanmu. Permainan dimulai begitu ia masuk." |
| Terputus | "Koneksi terputus. Mencoba menyambung ulang… (45 dtk)" |
| Remis | "Lawan menawarkan remis." [Terima] [Tolak] |
| Menyerah | "Yakin ingin menyerah? Permainan akan dianggap kalah." |
| Penuh | "Ruangan ini sudah penuh." |
| Kode salah | "Ruangan dengan kode ini tidak ditemukan. Periksa kembali kodenya." |
| Gagal P2P | "Tidak bisa terhubung langsung. Coba ganti jaringan (Wi-Fi ↔ seluler)." |

## 10. Checklist Aksesibilitas & QA Visual

- [ ] Kontras teks/papan diuji (terang & gelap)
- [ ] Target sentuh ≥ 44×44 px
- [ ] Semua aksi bisa lewat keyboard, fokus terlihat jelas
- [ ] Pembaca layar mengumumkan langkah, skak, dan hasil
- [ ] Tidak ada ketergantungan hanya pada warna
- [ ] Diuji di iOS Safari, Chrome Android, Firefox desktop
