import { useEffect, useRef } from 'react';
import type { MoveRecord } from '../game/types.ts';

type MoveListProps = { moves: MoveRecord[] };

export default function MoveList({ moves }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null);

  // Gulir ke langkah terbaru (vertikal di desktop, horizontal di HP).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = el.scrollWidth;
  }, [moves.length]);

  if (moves.length === 0) return <p className="moves moves--empty">Belum ada langkah.</p>;

  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ number: i / 2 + 1, white: moves[i]!, black: moves[i + 1] });
  }
  const lastIndex = moves.length - 1;
  const sanClass = (index: number) =>
    index === lastIndex ? 'moves__san moves__san--last' : 'moves__san';

  return (
    <ol ref={listRef} className="moves" aria-label="Daftar langkah">
      {pairs.map(({ number, white, black }) => (
        <li key={number} className="moves__pair">
          <span className="moves__num">{number}.</span>
          <span className={sanClass(number * 2 - 2)}>{white.san}</span>
          {black && <span className={sanClass(number * 2 - 1)}>{black.san}</span>}
        </li>
      ))}
    </ol>
  );
}
