import type { Color, PieceSymbol, Square } from 'chess.js';

export type { Color, PieceSymbol, Square };

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type BoardPiece = { type: PieceSymbol; color: Color };

export type MoveInput = { from: Square; to: Square; promotion?: PromotionPiece };

export type LegalTarget = { to: Square; capture: boolean; promotion: boolean };

export type MoveRecord = {
  san: string;
  from: Square;
  to: Square;
  color: Color;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
};

export type EndReason =
  | 'checkmate'
  | 'resign'
  | 'timeout'
  | 'stalemate'
  | 'insufficient'
  | 'repetition'
  | '50move'
  | 'agreement'
  | 'abandoned';

export type GameResult = { winner?: Color; reason: EndReason };

export type GameSnapshot = {
  fen: string;
  turn: Color;
  pieces: Partial<Record<Square, BoardPiece>>;
  moves: MoveRecord[];
  lastMove?: { from: Square; to: Square };
  /** Kotak raja pihak yang sedang dalam skak. */
  checkSquare?: Square;
  result?: GameResult;
  /** Bidak yang ditangkap OLEH tiap warna. */
  captured: Record<Color, PieceSymbol[]>;
  /** Nilai material tiap warna di papan (p=1, n/b=3, r=5, q=9). */
  material: Record<Color, number>;
};
