import { useMemo, useState } from 'react';
import { positionAt } from '../game/engine.ts';
import type { GameSnapshot } from '../game/types.ts';

/**
 * Melihat posisi sebelumnya tanpa mengubah permainan. `resetKey` berganti untuk
 * permainan baru (rematch / mulai ulang) sehingga tampilan kembali ke posisi terkini.
 */
export function useHistoryView(snapshot: GameSnapshot, resetKey: number) {
  const [viewed, setViewed] = useState<{ key: number; ply: number } | null>(null);
  const total = snapshot.moves.length;
  const ply = viewed && viewed.key === resetKey && viewed.ply < total ? viewed.ply : null;

  const view = useMemo(
    () => (ply === null ? snapshot : positionAt(snapshot.moves, ply)),
    [snapshot, ply],
  );

  return {
    /** Posisi yang ditampilkan di papan. */
    view,
    ply: ply ?? total,
    total,
    live: ply === null,
    /** Pilih posisi setelah `n` langkah; `n` ≥ jumlah langkah = posisi terkini. */
    show: (n: number) =>
      setViewed(n >= total ? null : { key: resetKey, ply: Math.max(0, Math.floor(n)) }),
  };
}
