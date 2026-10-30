import { describe, expect, it } from 'vitest';
import { formatClock, timeControlDescription } from './timeControl.ts';

describe('kontrol waktu', () => {
  it('memformat jam', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(299_001)).toBe('5:00');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(10_000)).toBe('0:10');
    expect(formatClock(9_380)).toBe('0:09.3');
    expect(formatClock(450)).toBe('0:00.4');
    expect(formatClock(0)).toBe('0:00.0');
    expect(formatClock(-50)).toBe('0:00.0');
  });

  it('menjelaskan kontrol waktu', () => {
    expect(timeControlDescription(null)).toBe('Tanpa batas waktu');
    expect(timeControlDescription({ initialMs: 600_000, incrementMs: 0 })).toBe(
      '10 menit per pemain',
    );
    expect(timeControlDescription({ initialMs: 180_000, incrementMs: 2_000 })).toBe(
      '3 menit + 2 detik per langkah',
    );
  });
});
