import { Chess, type Move } from 'chess.js';
import type {
  BoardPiece,
  Color,
  GameResult,
  GameSnapshot,
  LegalTarget,
  MoveInput,
  MoveRecord,
  PieceSymbol,
  PromotionPiece,
  Square,
} from './types.ts';

export const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

const toRecord = (m: Move): MoveRecord => ({
  san: m.san,
  from: m.from,
  to: m.to,
  color: m.color,
  piece: m.piece,
  ...(m.captured && { captured: m.captured }),
  ...(m.promotion && { promotion: m.promotion }),
});

/** Pembungkus chess.js: satu-satunya tempat aturan catur dijalankan. */
export class GameEngine {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = new Chess(fen);
  }

  /** Bangun ulang permainan dari daftar langkah; null bila ada langkah ilegal. */
  static fromMoves(moves: MoveInput[]): GameEngine | null {
    const engine = new GameEngine();
    for (const m of moves) {
      if (!engine.tryMove(m)) return null;
    }
    return engine;
  }

  get turn(): Color {
    return this.chess.turn();
  }

  /** Jumlah langkah (setengah langkah) yang sudah dimainkan. */
  get ply(): number {
    return this.chess.history().length;
  }

  moveList(): MoveInput[] {
    return this.chess.history({ verbose: true }).map((m) => ({
      from: m.from,
      to: m.to,
      ...(m.promotion && { promotion: m.promotion as PromotionPiece }),
    }));
  }

  /**
   * Apakah `color` masih mungkin men-skakmat. Dipakai saat lawan kehabisan waktu:
   * menurut FIDE hasilnya remis bila pemenang tidak punya bidak untuk skakmat.
   */
  hasMatingMaterial(color: Color): boolean {
    const own: PieceSymbol[] = [];
    let theirs = 0;
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell || cell.type === 'k') continue;
        if (cell.color === color) own.push(cell.type);
        else theirs++;
      }
    }
    if (own.length === 0) return false;
    const loneMinor = own.length === 1 && (own[0] === 'n' || own[0] === 'b');
    return !(loneMinor && theirs === 0);
  }

  /** Kotak tujuan legal dari `from`; kosong bila bukan giliran bidak itu atau permainan selesai. */
  legalTargets(from: Square): LegalTarget[] {
    const piece = this.chess.get(from);
    if (!piece || piece.color !== this.chess.turn() || this.result()) return [];

    // Promosi menghasilkan empat langkah ke kotak yang sama, jadi disatukan per kotak.
    // isCapture() chess.js tidak mencakup en passant, jadi dicek terpisah.
    const targets = new Map<Square, LegalTarget>();
    for (const m of this.chess.moves({ square: from, verbose: true })) {
      targets.set(m.to, {
        to: m.to,
        capture: m.isCapture() || m.isEnPassant(),
        promotion: m.isPromotion(),
      });
    }
    return [...targets.values()];
  }

  /** Jalankan langkah bila legal. Mengembalikan null untuk langkah ilegal tanpa mengubah posisi. */
  tryMove(input: MoveInput): MoveRecord | null {
    if (this.result()) return null;
    try {
      return toRecord(this.chess.move(input));
    } catch {
      return null;
    }
  }

  result(): GameResult | undefined {
    const c = this.chess;
    if (c.isCheckmate()) return { winner: opposite(c.turn()), reason: 'checkmate' };
    if (c.isStalemate()) return { reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { reason: 'insufficient' };
    if (c.isDrawByFiftyMoves()) return { reason: '50move' };
    if (c.isThreefoldRepetition()) return { reason: 'repetition' };
    return undefined;
  }

  snapshot(): GameSnapshot {
    const pieces: Partial<Record<Square, BoardPiece>> = {};
    const material: Record<Color, number> = { w: 0, b: 0 };
    let checkSquare: Square | undefined;
    const inCheck = this.chess.inCheck();

    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        pieces[cell.square] = { type: cell.type, color: cell.color };
        material[cell.color] += PIECE_VALUES[cell.type];
        if (inCheck && cell.type === 'k' && cell.color === this.chess.turn()) {
          checkSquare = cell.square;
        }
      }
    }

    const history = this.chess.history({ verbose: true });
    const captured: Record<Color, PieceSymbol[]> = { w: [], b: [] };
    for (const m of history) {
      if (m.captured) captured[m.color].push(m.captured);
    }
    const last = history.at(-1);
    const result = this.result();

    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      pieces,
      moves: history.map(toRecord),
      captured,
      material,
      ...(last && { lastMove: { from: last.from, to: last.to } }),
      ...(checkSquare && { checkSquare }),
      ...(result && { result }),
    };
  }
}
