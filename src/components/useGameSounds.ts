import { useEffect, useRef } from 'react';
import type { GameResult, MoveRecord } from '../game/types.ts';
import { playSound } from '../utils/sound.ts';

/**
 * Bunyi untuk langkah baru (biasa/tangkap/skak) dan akhir permainan. Posisi yang
 * berubah sekaligus banyak (dipulihkan, sync, permainan baru) tidak berbunyi.
 */
export function useGameSounds(moves: MoveRecord[], result: GameResult | undefined, game = 0) {
  const prev = useRef({ ply: moves.length, over: !!result, game });

  useEffect(() => {
    const p = prev.current;
    prev.current = { ply: moves.length, over: !!result, game };
    if (p.game !== game) return;
    if (result && !p.over) return playSound('end');
    if (moves.length !== p.ply + 1) return;
    const last = moves.at(-1);
    if (!last) return;
    playSound(/[+#]$/.test(last.san) ? 'check' : last.captured ? 'capture' : 'move');
  }, [moves, result, game]);
}
