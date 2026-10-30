import { opposite } from './engine.ts';
import type { BoardPiece, Color, GameResult, MoveRecord, PieceSymbol, Square } from './types.ts';

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pion',
  n: 'kuda',
  b: 'gajah',
  r: 'benteng',
  q: 'menteri',
  k: 'raja',
};

export const COLOR_NAMES: Record<Color, string> = { w: 'putih', b: 'hitam' };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Putih" / "Hitam". */
export const colorTitle = (color: Color) => capitalize(COLOR_NAMES[color]);

export const pieceLabel = (piece: BoardPiece) =>
  `${PIECE_NAMES[piece.type]} ${COLOR_NAMES[piece.color]}`;

/** Label pembaca layar untuk satu kotak, mis. "e2, pion putih". */
export const squareLabel = (square: Square, piece?: BoardPiece) =>
  `${square}, ${piece ? pieceLabel(piece) : 'kosong'}`;

export function resultText(result: GameResult): string {
  const winner = result.winner && capitalize(COLOR_NAMES[result.winner]);
  const loser = result.winner && capitalize(COLOR_NAMES[opposite(result.winner)]);

  switch (result.reason) {
    case 'checkmate':
      return `Skakmat — ${winner} menang`;
    case 'resign':
      return `${loser} menyerah — ${winner} menang`;
    case 'timeout':
      return `Waktu ${loser} habis — ${winner} menang`;
    case 'abandoned':
      return `${loser} meninggalkan permainan — ${winner} menang`;
    case 'stalemate':
      return 'Remis — pat (tidak ada langkah legal)';
    case 'insufficient':
      return 'Remis — bidak tidak cukup untuk skakmat';
    case 'repetition':
      return 'Remis — posisi berulang tiga kali';
    case '50move':
      return 'Remis — aturan 50 langkah';
    case 'agreement':
      return 'Remis atas kesepakatan';
  }
}

export const turnText = (turn: Color, inCheck: boolean) =>
  `Giliran ${COLOR_NAMES[turn]}${inCheck ? ' — skak!' : ''}`;

/** Kalimat pembaca layar untuk satu langkah, mis. "Putih: kuda ke f3". */
export function moveText(move: MoveRecord): string {
  const who = capitalize(COLOR_NAMES[move.color]);
  const check = move.san.endsWith('#') ? ', skakmat' : move.san.endsWith('+') ? ', skak' : '';

  if (move.san.startsWith('O-O-O')) return `${who}: rokade panjang${check}`;
  if (move.san.startsWith('O-O')) return `${who}: rokade pendek${check}`;

  const piece = PIECE_NAMES[move.piece];
  const action = move.captured
    ? `${piece} menangkap ${PIECE_NAMES[move.captured]} di ${move.to}`
    : `${piece} ke ${move.to}`;
  const promo = move.promotion ? `, promosi menjadi ${PIECE_NAMES[move.promotion]}` : '';
  return `${who}: ${action}${promo}${check}`;
}
