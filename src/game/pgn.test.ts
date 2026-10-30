import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine.ts';
import { buildPgn, pgnFileName, resultTag } from './pgn.ts';
import type { MoveInput, Square } from './types.ts';

const play = (uci: string[]) => {
  const engine = new GameEngine();
  for (const m of uci) {
    const input: MoveInput = { from: m.slice(0, 2) as Square, to: m.slice(2, 4) as Square };
    if (!engine.tryMove(input)) throw new Error(`Langkah ilegal: ${m}`);
  }
  return engine.snapshot();
};

describe('PGN', () => {
  it('menulis tag dan langkah, termasuk hasil', () => {
    const s = play(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const pgn = buildPgn({
      moves: s.moves,
      white: 'Ani "si cepat"',
      black: 'Budi',
      result: s.result,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      date: new Date(2026, 9, 31),
    });
    expect(pgn).toContain('[Date "2026.10.31"]');
    expect(pgn).toContain('[White "Ani \\"si cepat\\""]');
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toContain('[TimeControl "180+2"]');
    expect(pgn).toContain('1. f3 e5 2. g4 Qh4# 0-1');
  });

  it('memetakan hasil ke tag Result', () => {
    expect(resultTag()).toBe('*');
    expect(resultTag({ reason: 'aborted' })).toBe('*');
    expect(resultTag({ reason: 'agreement' })).toBe('1/2-1/2');
    expect(resultTag({ winner: 'w', reason: 'resign' })).toBe('1-0');
  });

  it('mencatat alasan berakhir yang tidak terlihat dari langkah', () => {
    const pgn = buildPgn({
      moves: play(['e2e4']).moves,
      white: 'A',
      black: 'B',
      result: { winner: 'w', reason: 'abandoned' },
    });
    expect(pgn).toContain('[Termination "abandoned"]');
    expect(pgn).toContain('1. e4 1-0');
  });

  it('membuat nama file dari tanggal', () => {
    expect(pgnFileName(new Date(2026, 9, 31, 14, 5))).toBe('catur-20261031-1405.pgn');
  });
});
