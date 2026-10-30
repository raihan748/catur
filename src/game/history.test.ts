import { describe, expect, it } from 'vitest';
import { GameEngine, positionAt } from './engine.ts';
import type { Square } from './types.ts';

describe('positionAt', () => {
  it('membangun ulang posisi setelah sejumlah langkah', () => {
    const engine = new GameEngine();
    for (const m of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'e7e8']) {
      engine.tryMove({ from: m.slice(0, 2) as Square, to: m.slice(2) as Square });
    }
    const { moves, fen } = engine.snapshot();
    expect(moves).toHaveLength(4); // langkah terakhir ilegal, diabaikan

    expect(positionAt(moves, 0).fen).toBe(new GameEngine().snapshot().fen);
    const after2 = positionAt(moves, 2);
    expect(after2.lastMove).toEqual({ from: 'e7', to: 'e5' });
    expect(after2.moves).toHaveLength(2);
    expect(positionAt(moves, 4).fen).toBe(fen);
  });

  it('mengulang promosi dengan benar', () => {
    const engine = new GameEngine();
    for (const m of ['a2a4', 'h7h5', 'a4a5', 'h5h4', 'a5a6', 'h4h3', 'a6b7', 'h3g2']) {
      engine.tryMove({ from: m.slice(0, 2) as Square, to: m.slice(2) as Square });
    }
    engine.tryMove({ from: 'b7', to: 'a8', promotion: 'n' }); // promosi menjadi kuda
    const { moves } = engine.snapshot();
    expect(moves).toHaveLength(9);
    expect(positionAt(moves, 9).pieces.a8).toEqual({ type: 'n', color: 'w' });
    expect(positionAt(moves, 8).pieces.a8).toEqual({ type: 'r', color: 'b' });
  });
});
