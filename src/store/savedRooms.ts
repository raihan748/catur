import type { Color } from '../game/types.ts';
import type { Role } from '../net/session.ts';
import { readStorage, removeStorage, storageKeys, writeStorage } from '../utils/storage.ts';

// Ruangan yang sedang dimainkan disimpan di localStorage agar permainan bertahan saat
// halaman dimuat ulang atau tab ditutup lalu dibuka lagi (PRD F16). Isi permainan
// divalidasi ulang dengan skema protokol saat dipulihkan (roomStore). Modul ini tidak
// memuat Zod/chess.js karena juga dipakai beranda.

const PREFIX = 'catur:room:';
/** Simpanan yang lebih tua dari ini dianggap basi dan dihapus. */
const MAX_AGE_MS = 24 * 60 * 60_000;
/** Lama menunggu kunci: cukup untuk tab yang sedang dimuat ulang melepasnya. */
const LOCK_WAIT_MS = 1_000;

export type SavedRoom = {
  code: string;
  role: Role;
  /** Identitas pemain di ruangan ini; tamu memakainya untuk mengambil kembali kursinya. */
  clientId: string;
  /** Nama yang dipakai di ruangan ini (nama di beranda bisa berubah sesudahnya). */
  myName: string;
  /** Host: tamu yang memegang kursi lawan. */
  guestClientId: string | null;
  opponentName: string | null;
  /** Keadaan permainan (bentuk isi `sync`); null = belum mulai. */
  game: unknown;
  savedAt: number;
};

const keyOf = (code: string, role: Role) => `${PREFIX}${code}:${role}`;

function parse(raw: string | null): SavedRoom | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<SavedRoom> | null;
    if (
      typeof r?.code !== 'string' ||
      (r.role !== 'host' && r.role !== 'guest') ||
      typeof r.clientId !== 'string' ||
      typeof r.savedAt !== 'number'
    ) {
      return null;
    }
    return {
      code: r.code,
      role: r.role,
      clientId: r.clientId,
      myName: typeof r.myName === 'string' ? r.myName : '',
      guestClientId: typeof r.guestClientId === 'string' ? r.guestClientId : null,
      opponentName: typeof r.opponentName === 'string' ? r.opponentName : null,
      game: r.game ?? null,
      savedAt: r.savedAt,
    };
  } catch {
    return null;
  }
}

export function loadRoom(code: string, role: Role): SavedRoom | null {
  const key = keyOf(code, role);
  const room = parse(readStorage('local', key));
  if (room && Date.now() - room.savedAt < MAX_AGE_MS) return room;
  removeStorage('local', key); // rusak atau basi
  return null;
}

export const saveRoom = (room: SavedRoom) =>
  writeStorage('local', keyOf(room.code, room.role), JSON.stringify(room));

export const removeRoom = (code: string, role: Role) => removeStorage('local', keyOf(code, role));

export type ResumableRoom = {
  code: string;
  role: Role;
  myColor: Color;
  opponentName: string;
  savedAt: number;
};

/** Permainan yang belum selesai, terbaru dulu (tombol "Lanjutkan" di beranda). */
export function listResumableRooms(): ResumableRoom[] {
  const rooms: ResumableRoom[] = [];
  for (const key of storageKeys('local', PREFIX)) {
    const [code = '', role] = key.slice(PREFIX.length).split(':');
    if (role !== 'host' && role !== 'guest') continue;
    const room = loadRoom(code, role);
    const game = room?.game as { hostColor?: unknown; result?: unknown } | null | undefined;
    if (!room || room.opponentName === null || !game || game.result !== null) continue;
    if (game.hostColor !== 'w' && game.hostColor !== 'b') continue;
    const hostColor: Color = game.hostColor;
    rooms.push({
      code,
      role,
      myColor: role === 'host' ? hostColor : hostColor === 'w' ? 'b' : 'w',
      opponentName: room.opponentName,
      savedAt: room.savedAt,
    });
  }
  return rooms.sort((a, b) => b.savedAt - a.savedAt);
}

export type RoomClaim = {
  role: Role;
  saved: SavedRoom | null;
  /** false: tab lain di browser ini sudah memegang kursi ini, jadi jangan simpan apa pun. */
  persist: boolean;
  release: () => void;
};

/**
 * Tentukan peran tab ini di ruangan dan ambil simpanannya. `want` = 'host' saat
 * membuat ruangan, peran tertentu saat melanjutkan dari beranda, atau null (buka
 * tautan: host bila ada simpanan host, selain itu tamu). Web Locks mencegah dua tab
 * di browser yang sama memakai simpanan yang sama (mis. host dan tamu diuji di dua
 * tab): tab yang tidak mendapat kunci menjadi tamu baru tanpa simpanan.
 */
export async function claimRoom(code: string, want: Role | null): Promise<RoomClaim> {
  if (want !== 'guest') {
    const release = await lock(keyOf(code, 'host'));
    if (release) {
      const saved = loadRoom(code, 'host');
      if (want === 'host' || saved) return { role: 'host', saved, persist: true, release };
      release();
    }
  }
  const release = await lock(keyOf(code, 'guest'));
  if (release) return { role: 'guest', saved: loadRoom(code, 'guest'), persist: true, release };
  return { role: 'guest', saved: null, persist: false, release: () => {} };
}

/** Ambil kunci Web Locks; null bila masih dipegang tab lain setelah menunggu sebentar. */
function lock(name: string): Promise<(() => void) | null> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  // Browser tanpa Web Locks: anggap selalu bebas (satu browser biasanya satu pemain).
  if (!locks) return Promise.resolve(() => {});
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LOCK_WAIT_MS);
  return new Promise((resolve) => {
    locks
      .request(name, { signal: abort.signal }, () => {
        clearTimeout(timer);
        return new Promise<void>((release) => resolve(() => release()));
      })
      .catch(() => resolve(null));
  });
}
