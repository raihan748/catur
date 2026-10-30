import { PIECE_NAMES } from '../game/labels.ts';
import type { Color, PieceSymbol } from '../game/types.ts';
import Piece from './Piece.tsx';

type CapturedPiecesProps = {
  pieces: PieceSymbol[];
  /** Warna bidak yang tertangkap (warna lawan). */
  color: Color;
  /** Keunggulan material pemain ini; hanya ditampilkan bila positif. */
  advantage: number;
};

const ORDER: PieceSymbol[] = ['p', 'n', 'b', 'r', 'q'];

export default function CapturedPieces({ pieces, color, advantage }: CapturedPiecesProps) {
  const sorted = [...pieces].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const summary = sorted.length ? sorted.map((p) => PIECE_NAMES[p]).join(', ') : 'tidak ada';

  return (
    <div className="captured">
      <span className="sr-only">Bidak tertangkap: {summary}</span>
      {sorted.map((type, i) => (
        <Piece key={i} piece={{ type, color }} className="captured__piece" />
      ))}
      {advantage > 0 && <span className="captured__adv">+{advantage}</span>}
    </div>
  );
}
