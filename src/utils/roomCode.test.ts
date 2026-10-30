import { describe, expect, it } from 'vitest';
import {
  formatRoomCode,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
} from './roomCode.ts';

describe('kode ruangan', () => {
  it('membuat kode valid tanpa karakter ambigu', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it('menormalkan masukan pengguna', () => {
    expect(normalizeRoomCode(' k7m-2qx ')).toBe('K7M2QX');
    expect(normalizeRoomCode('k7m 2qx')).toBe('K7M2QX');
  });

  it('menolak kode yang salah', () => {
    expect(isValidRoomCode('K7M2Q')).toBe(false);
    expect(isValidRoomCode('K7M2QXX')).toBe(false);
    expect(isValidRoomCode('K7M2Q0')).toBe(false);
    expect(isValidRoomCode('k7m2qx')).toBe(false);
  });

  it('memformat kode menjadi dua kelompok', () => {
    expect(formatRoomCode('K7M2QX')).toBe('K7M 2QX');
  });
});
