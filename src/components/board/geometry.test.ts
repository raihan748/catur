import { describe, expect, it } from 'vitest';
import {
  displaySquares,
  gridFromSquare,
  isLightSquare,
  squareFromPoint,
  stepSquare,
} from './geometry.ts';

describe('geometri papan', () => {
  it('mengurutkan kotak sesuai arah papan', () => {
    const white = displaySquares('w');
    expect(white[0]).toBe('a8');
    expect(white[63]).toBe('h1');

    const black = displaySquares('b');
    expect(black[0]).toBe('h1');
    expect(black[63]).toBe('a8');
  });

  it('mengubah titik menjadi kotak', () => {
    expect(squareFromPoint(0, 0, 800, 'w')).toBe('a8');
    expect(squareFromPoint(799, 799, 800, 'w')).toBe('h1');
    expect(squareFromPoint(450, 650, 800, 'w')).toBe('e2');
    expect(squareFromPoint(0, 0, 800, 'b')).toBe('h1');
    expect(squareFromPoint(-1, 10, 800, 'w')).toBeNull();
    expect(squareFromPoint(10, 800, 800, 'w')).toBeNull();
  });

  it('menghitung posisi grid dari kotak', () => {
    expect(gridFromSquare('e2', 'w')).toEqual({ row: 6, col: 4 });
    expect(gridFromSquare('e2', 'b')).toEqual({ row: 1, col: 3 });
  });

  it('menentukan warna kotak', () => {
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
    expect(isLightSquare('e4')).toBe(true);
  });

  it('menggeser kotak dengan batas tepi', () => {
    expect(stepSquare('e2', -1, 0, 'w')).toBe('e3');
    expect(stepSquare('e2', -1, 0, 'b')).toBe('e1');
    expect(stepSquare('a1', 1, -1, 'w')).toBe('a1');
  });
});
