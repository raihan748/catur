import { useEffect, useRef } from 'react';
import { moveText } from '../game/labels.ts';
import type { MoveRecord } from '../game/types.ts';

type MoveListProps = {
  moves: MoveRecord[];
  /** Posisi yang ditampilkan (jumlah langkah); langkah ke-`current` disorot. */
  current: number;
  /** Klik langkah: tampilkan posisi setelah langkah itu. */
  onSelect: (ply: number) => void;
};

export default function MoveList({ moves, current, onSelect }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const live = current >= moves.length;

  // Gulir daftar (bukan halaman) ke langkah terbaru, atau ke langkah yang sedang dilihat.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const btn = live ? null : el.querySelector<HTMLElement>('[aria-current="true"]');
    if (btn) {
      el.scrollTop = btn.offsetTop - el.clientHeight / 2;
      el.scrollLeft = btn.offsetLeft - el.clientWidth / 2;
    } else {
      el.scrollTop = el.scrollHeight;
      el.scrollLeft = el.scrollWidth;
    }
  }, [current, live, moves.length]);

  if (moves.length === 0) return <p className="moves moves--empty">Belum ada langkah.</p>;

  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ number: i / 2 + 1, white: moves[i]!, black: moves[i + 1] });
  }

  const san = (move: MoveRecord, index: number) => {
    const isCurrent = index === current - 1;
    return (
      <button
        type="button"
        className={isCurrent ? 'moves__san moves__san--current' : 'moves__san'}
        aria-current={isCurrent || undefined}
        aria-label={moveText(move)}
        onClick={() => onSelect(index + 1)}
      >
        {move.san}
      </button>
    );
  };

  return (
    <ol ref={listRef} className="moves" aria-label="Daftar langkah">
      {pairs.map(({ number, white, black }) => (
        <li key={number} className="moves__pair">
          <span className="moves__num">{number}.</span>
          {san(white, number * 2 - 2)}
          {black && san(black, number * 2 - 1)}
        </li>
      ))}
    </ol>
  );
}
