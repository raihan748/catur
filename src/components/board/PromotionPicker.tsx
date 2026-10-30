import { PIECE_NAMES } from '../../game/labels.ts';
import type { Color, PromotionPiece, Square } from '../../game/types.ts';
import Piece from '../Piece.tsx';
import { gridFromSquare } from './geometry.ts';

type PromotionPickerProps = {
  to: Square;
  color: Color;
  orientation: Color;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
};

const CHOICES: PromotionPiece[] = ['q', 'n', 'r', 'b'];

/** Empat pilihan promosi, berjajar dari kotak tujuan ke arah tengah papan. */
export default function PromotionPicker({
  to,
  color,
  orientation,
  onSelect,
  onCancel,
}: PromotionPickerProps) {
  const { row, col } = gridFromSquare(to, orientation);
  const direction = row === 0 ? 1 : -1;

  return (
    <div
      className="promo"
      role="dialog"
      aria-modal="true"
      aria-label="Pilih bidak promosi"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onCancel();
      }}
    >
      {CHOICES.map((piece, i) => (
        <button
          key={piece}
          type="button"
          className="promo__choice"
          style={{ left: `${col * 12.5}%`, top: `${(row + direction * i) * 12.5}%` }}
          aria-label={`Promosi menjadi ${PIECE_NAMES[piece]}`}
          autoFocus={i === 0}
          onClick={() => onSelect(piece)}
        >
          <Piece piece={{ type: piece, color }} />
        </button>
      ))}
    </div>
  );
}
