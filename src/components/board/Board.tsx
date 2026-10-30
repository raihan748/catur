import { useCallback, useMemo, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, PointerEvent } from 'react';
import { squareLabel } from '../../game/labels.ts';
import type {
  BoardPiece,
  Color,
  LegalTarget,
  MoveInput,
  PromotionPiece,
  Square,
} from '../../game/types.ts';
import Piece from '../Piece.tsx';
import { displaySquares, isLightSquare, squareFromPoint, stepSquare } from './geometry.ts';
import PromotionPicker from './PromotionPicker.tsx';
import './board.css';

type Pieces = Partial<Record<Square, BoardPiece>>;

type BoardProps = {
  pieces: Pieces;
  orientation: Color;
  /** Warna yang boleh digerakkan sekarang; null = papan terkunci. */
  movable: Color | null;
  lastMove?: { from: Square; to: Square };
  checkSquare?: Square;
  getTargets: (from: Square) => LegalTarget[];
  onMove: (move: MoveInput) => void;
};

type DragState = {
  pointerId: number;
  from: Square;
  startX: number;
  startY: number;
  active: boolean;
  /** Bidak sudah terpilih sebelum ditekan: lepas tanpa seret = batal pilih. */
  deselectOnUp: boolean;
};

const DRAG_THRESHOLD_PX = 4;

const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export default function Board({
  pieces,
  orientation,
  movable,
  lastMove,
  checkSquare,
  getTargets,
  onMove,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  // Pilihan dan promosi dicatat bersama posisi saat dibuat, sehingga otomatis
  // tidak berlaku lagi begitu posisi berubah (mis. lawan melangkah).
  const [selection, setSelection] = useState<{ square: Square; pieces: Pieces } | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; pieces: Pieces } | null>(
    null,
  );
  const [dragFrom, setDragFrom] = useState<Square | null>(null);
  const [cursor, setCursor] = useState<Square>('e2');

  const selected = movable && selection?.pieces === pieces ? selection.square : null;
  const pendingPromotion = movable && promotion?.pieces === pieces ? promotion : null;
  const targets = useMemo(
    () => new Map((selected ? getTargets(selected) : []).map((t) => [t.to, t])),
    [selected, getTargets],
  );
  const squares = useMemo(() => displaySquares(orientation), [orientation]);

  const canSelect = (square: Square) => movable !== null && pieces[square]?.color === movable;
  const select = (square: Square | null) => setSelection(square ? { square, pieces } : null);

  /** Coba langkah from→to. Mengembalikan false bila tidak legal. */
  const attempt = (from: Square, to: Square) => {
    const target = getTargets(from).find((t) => t.to === to);
    if (!target) return false;
    if (target.promotion) {
      select(from);
      setPromotion({ from, to, pieces });
      return true;
    }
    select(null);
    onMove({ from, to });
    return true;
  };

  /** Logika ketuk/klik/Enter pada satu kotak. */
  const activate = (square: Square): 'moved' | 'selected' | 'reselected' | 'cleared' => {
    if (selected && selected !== square && targets.has(square)) {
      attempt(selected, square);
      return 'moved';
    }
    if (canSelect(square)) {
      const wasSelected = selected === square;
      select(square);
      return wasSelected ? 'reselected' : 'selected';
    }
    select(null);
    return 'cleared';
  };

  const pointToSquare = (e: { clientX: number; clientY: number }) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return squareFromPoint(e.clientX - rect.left, e.clientY - rect.top, rect.width, orientation);
  };

  const placeGhost = useCallback(() => {
    const el = ghostRef.current;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!el || !rect) return;
    const half = rect.width / 16;
    const x = pointer.current.x - rect.left - half;
    const y = pointer.current.y - rect.top - half;
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  const setGhostRef = useCallback(
    (el: HTMLDivElement | null) => {
      ghostRef.current = el;
      placeGhost();
    },
    [placeGhost],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || pendingPromotion) return;
    const square = pointToSquare(e);
    if (!square) return;
    setCursor(square);

    const outcome = activate(square);
    if (outcome === 'selected' || outcome === 'reselected') {
      drag.current = {
        pointerId: e.pointerId,
        from: square,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        deselectOnUp: outcome === 'reselected',
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      setDragFrom(d.from);
    }
    placeGhost();
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>, drop: boolean) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;

    if (!d.active) {
      if (drop && d.deselectOnUp) select(null);
      return;
    }
    setDragFrom(null);
    if (!drop) return;
    // Dilepas di luar papan atau di kotak ilegal: bidak kembali, tetap terpilih.
    const square = pointToSquare(e);
    if (square && square !== d.from && attempt(d.from, square)) setCursor(square);
  };

  const focusSquare = (square: Square) => {
    setCursor(square);
    boardRef.current?.querySelector<HTMLElement>(`[data-square="${square}"]`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (pendingPromotion) return;
    const step = ARROW_STEPS[e.key];
    if (step) {
      e.preventDefault();
      focusSquare(stepSquare(cursor, step[0], step[1], orientation));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activate(cursor) === 'reselected') select(null);
    } else if (e.key === 'Escape') {
      select(null);
    }
  };

  // Kursor keyboard selalu mengikuti kotak yang sedang difokus (Tab, klik, atau programatik).
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const square = (e.target as HTMLElement).dataset.square as Square | undefined;
    if (square) setCursor(square);
  };

  const finishPromotion = (piece: PromotionPiece | null) => {
    if (!pendingPromotion) return;
    setPromotion(null);
    select(null);
    if (piece) onMove({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
  };

  const dragPiece = dragFrom ? pieces[dragFrom] : undefined;

  return (
    <div
      ref={boardRef}
      className="board"
      role="grid"
      aria-label="Papan catur"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
        <div role="row" className="board__row" key={row}>
          {squares.slice(row * 8, row * 8 + 8).map((square, col) => {
            const piece = pieces[square];
            const target = targets.get(square);
            const className = [
              'sq',
              isLightSquare(square) ? 'sq--light' : 'sq--dark',
              canSelect(square) && 'sq--movable',
              target && 'sq--target',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={square}
                role="gridcell"
                data-square={square}
                tabIndex={square === cursor ? 0 : -1}
                aria-label={squareLabel(square, piece)}
                aria-selected={square === selected}
                className={className}
              >
                {(lastMove?.from === square || lastMove?.to === square) && (
                  <span className="sq__hl sq__hl--last" />
                )}
                {square === selected && <span className="sq__hl sq__hl--selected" />}
                {square === checkSquare && <span className="sq__check" />}
                {piece && (
                  <Piece
                    piece={piece}
                    className={square === dragFrom ? 'sq__piece sq__piece--ghosted' : 'sq__piece'}
                  />
                )}
                {target && (
                  <span className={target.capture ? 'sq__hint sq__hint--capture' : 'sq__hint'} />
                )}
                {col === 0 && <span className="sq__coord sq__coord--rank">{square[1]}</span>}
                {row === 7 && <span className="sq__coord sq__coord--file">{square[0]}</span>}
              </div>
            );
          })}
        </div>
      ))}

      {dragPiece && (
        <div ref={setGhostRef} className="board__ghost">
          <Piece piece={dragPiece} />
        </div>
      )}

      {pendingPromotion && movable && (
        <PromotionPicker
          to={pendingPromotion.to}
          color={movable}
          orientation={orientation}
          onSelect={finishPromotion}
          onCancel={() => finishPromotion(null)}
        />
      )}
    </div>
  );
}
