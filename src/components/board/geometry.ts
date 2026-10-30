import type { Color, Square } from '../../game/types.ts';

const FILES = 'abcdefgh';

/** Baris/kolom tampilan (0 = atas/kiri) → kotak, sesuai arah papan. */
export function squareFromGrid(row: number, col: number, orientation: Color): Square {
  const file = orientation === 'w' ? col : 7 - col;
  const rank = orientation === 'w' ? 7 - row : row;
  return `${FILES.charAt(file)}${rank + 1}` as Square;
}

export function gridFromSquare(square: Square, orientation: Color) {
  const file = square.charCodeAt(0) - 97;
  const rank = square.charCodeAt(1) - 49;
  return orientation === 'w' ? { row: 7 - rank, col: file } : { row: rank, col: 7 - file };
}

/** 64 kotak dalam urutan tampilan, baris demi baris dari kiri atas. */
export function displaySquares(orientation: Color): Square[] {
  const squares: Square[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) squares.push(squareFromGrid(row, col, orientation));
  }
  return squares;
}

/** Titik relatif terhadap pojok kiri atas papan → kotak, atau null bila di luar papan. */
export function squareFromPoint(
  x: number,
  y: number,
  boardSize: number,
  orientation: Color,
): Square | null {
  if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return null;
  const size = boardSize / 8;
  return squareFromGrid(Math.floor(y / size), Math.floor(x / size), orientation);
}

export const isLightSquare = (square: Square) =>
  (square.charCodeAt(0) - 97 + square.charCodeAt(1) - 49) % 2 === 1;

/** Geser kotak sejauh (dRow, dCol) dalam arah tampilan, dibatasi tepi papan. */
export function stepSquare(square: Square, dRow: number, dCol: number, orientation: Color): Square {
  const { row, col } = gridFromSquare(square, orientation);
  const clamp = (n: number) => Math.min(7, Math.max(0, n));
  return squareFromGrid(clamp(row + dRow), clamp(col + dCol), orientation);
}
