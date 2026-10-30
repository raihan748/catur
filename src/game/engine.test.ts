import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine.ts';
import type { MoveInput, Square } from './types.ts';

const play = (engine: GameEngine, moves: string[]) => {
  for (const m of moves) {
    const input: MoveInput = { from: m.slice(0, 2) as Square, to: m.slice(2, 4) as Square };
    if (!engine.tryMove(input)) throw new Error(`Langkah ilegal di test: ${m}`);
  }
};

const targets = (engine: GameEngine, from: Square) =>
  engine
    .legalTargets(from)
    .map((t) => t.to)
    .sort();

describe('GameEngine', () => {
  it('memberi langkah legal hanya untuk pihak yang sedang giliran', () => {
    const engine = new GameEngine();
    expect(targets(engine, 'e2')).toEqual(['e3', 'e4']);
    expect(targets(engine, 'e7')).toEqual([]);
    expect(targets(engine, 'e4')).toEqual([]);
  });

  it('menolak langkah ilegal tanpa mengubah posisi', () => {
    const engine = new GameEngine();
    const before = engine.snapshot().fen;
    expect(engine.tryMove({ from: 'e2', to: 'e5' })).toBeNull();
    expect(engine.tryMove({ from: 'e7', to: 'e5' })).toBeNull();
    expect(engine.snapshot().fen).toBe(before);
  });

  it('mengizinkan rokade pendek dan panjang', () => {
    const engine = new GameEngine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(targets(engine, 'e1')).toEqual(expect.arrayContaining(['c1', 'g1']));

    const move = engine.tryMove({ from: 'e1', to: 'g1' });
    expect(move?.san).toBe('O-O');
    expect(engine.snapshot().pieces.f1).toEqual({ type: 'r', color: 'w' });
  });

  it('melarang rokade melewati kotak yang diserang', () => {
    // Benteng hitam di f2 menyerang f1, jadi O-O ilegal tetapi O-O-O tetap legal.
    const engine = new GameEngine('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
    const t = targets(engine, 'e1');
    expect(t).toContain('c1');
    expect(t).not.toContain('g1');
  });

  it('menangani en passant', () => {
    const engine = new GameEngine();
    play(engine, ['e2e4', 'a7a6', 'e4e5', 'd7d5']);

    const ep = engine.legalTargets('e5').find((t) => t.to === 'd6');
    expect(ep).toEqual({ to: 'd6', capture: true, promotion: false });

    const move = engine.tryMove({ from: 'e5', to: 'd6' });
    expect(move?.captured).toBe('p');
    const snap = engine.snapshot();
    expect(snap.pieces.d5).toBeUndefined();
    expect(snap.captured).toEqual({ w: ['p'], b: [] });
    expect(snap.material.w - snap.material.b).toBe(1);
  });

  it('mewajibkan pilihan bidak saat promosi', () => {
    const engine = new GameEngine('8/P7/8/8/8/8/8/k6K w - - 0 1');
    expect(engine.legalTargets('a7')).toEqual([{ to: 'a8', capture: false, promotion: true }]);
    expect(engine.tryMove({ from: 'a7', to: 'a8' })).toBeNull();

    const move = engine.tryMove({ from: 'a7', to: 'a8', promotion: 'n' });
    expect(move?.san).toBe('a8=N');
    expect(engine.snapshot().pieces.a8).toEqual({ type: 'n', color: 'w' });
  });

  it('mendeteksi skakmat dan mengunci papan', () => {
    const engine = new GameEngine();
    play(engine, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);

    const snap = engine.snapshot();
    expect(snap.result).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(snap.checkSquare).toBe('e1');
    expect(engine.legalTargets('a2')).toEqual([]);
    expect(engine.tryMove({ from: 'a2', to: 'a3' })).toBeNull();
  });

  it('menandai kotak raja saat skak', () => {
    const engine = new GameEngine();
    play(engine, ['e2e4', 'f7f6', 'd1h5']);
    const snap = engine.snapshot();
    expect(snap.checkSquare).toBe('e8');
    expect(snap.result).toBeUndefined();
  });

  it('mendeteksi pat (stalemate)', () => {
    const engine = new GameEngine('k7/8/2Q5/8/8/8/8/7K w - - 0 1');
    play(engine, ['c6b6']);
    expect(engine.snapshot().result).toEqual({ reason: 'stalemate' });
  });

  it('mendeteksi bidak tidak cukup', () => {
    const engine = new GameEngine('k7/8/8/8/8/8/1q6/K7 w - - 0 1');
    play(engine, ['a1b2']);
    expect(engine.snapshot().result).toEqual({ reason: 'insufficient' });
  });

  it('mendeteksi pengulangan posisi tiga kali', () => {
    const engine = new GameEngine();
    play(engine, ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1']);
    expect(engine.snapshot().result).toBeUndefined();
    play(engine, ['f6g8']);
    expect(engine.snapshot().result).toEqual({ reason: 'repetition' });
  });

  it('membangun ulang permainan dari daftar langkah', () => {
    const original = new GameEngine();
    play(original, ['e2e4', 'e7e5', 'g1f3']);

    const rebuilt = GameEngine.fromMoves(original.moveList());
    expect(rebuilt?.snapshot().fen).toBe(original.snapshot().fen);
    expect(rebuilt?.ply).toBe(3);
    expect(GameEngine.fromMoves([{ from: 'e2', to: 'e5' }])).toBeNull();
  });

  it('menilai bahan skakmat untuk aturan waktu habis', () => {
    expect(new GameEngine().hasMatingMaterial('w')).toBe(true);
    expect(new GameEngine('k7/8/8/8/8/8/8/K7 w - - 0 1').hasMatingMaterial('w')).toBe(false);
    // Raja + satu kuda melawan raja sendirian: tidak bisa skakmat.
    expect(new GameEngine('k7/8/8/8/8/8/8/KN6 w - - 0 1').hasMatingMaterial('w')).toBe(false);
    // Raja + kuda melawan raja + pion: skakmat masih mungkin.
    expect(new GameEngine('k7/p7/8/8/8/8/8/KN6 w - - 0 1').hasMatingMaterial('w')).toBe(true);
    expect(new GameEngine('k7/8/8/8/8/8/P7/K7 w - - 0 1').hasMatingMaterial('w')).toBe(true);
  });

  it('mendeteksi aturan 50 langkah', () => {
    const engine = new GameEngine('8/8/8/8/8/8/k7/4K2R w - - 99 80');
    play(engine, ['h1h3']);
    expect(engine.snapshot().result).toEqual({ reason: '50move' });
  });
});
