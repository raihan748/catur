/** Alfabet kode ruangan: tanpa karakter yang mudah tertukar (0/O dan 1/I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 6;

const VALID_CODE = new RegExp(`^[${ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  // 256 habis dibagi 32 (panjang alfabet), jadi modulo tidak bias.
  return Array.from(bytes, (b) => ALPHABET.charAt(b % ALPHABET.length)).join('');
}

/** Huruf besar, buang spasi/tanda hubung dan karakter non-alfanumerik lain. */
export const normalizeRoomCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isValidRoomCode = (code: string) => VALID_CODE.test(code);

/** "K7M2QX" → "K7M 2QX" agar mudah dibacakan. */
export const formatRoomCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
