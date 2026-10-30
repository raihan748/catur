import { describe, expect, it } from 'vitest';
import { createMessage, MAX_NAME_LENGTH, parseMessage } from './protocol.ts';

const hello = { name: 'Ani', clientId: 'c1', sessionId: 's1', protocol: 1 };

const sync = {
  game: 1,
  hostColor: 'w' as const,
  timeControl: { initialMs: 300_000, incrementMs: 0 },
  moves: [{ from: 'e2' as const, to: 'e4' as const }],
  clocks: { w: 300_000, b: 299_000 },
  result: null,
};

describe('protokol', () => {
  it('menerima pesan yang valid', () => {
    const msg = createMessage('hello', 0, hello);
    expect(parseMessage(msg)).toEqual(msg);
    expect(parseMessage(createMessage('sync', 1, sync))?.t).toBe('sync');

    const move = createMessage('move', 2, {
      game: 1,
      ply: 0,
      from: 'a7',
      to: 'a8',
      promotion: 'q',
      san: 'a8=Q+',
      clockMs: 1234,
    });
    expect(parseMessage(move)?.t).toBe('move');
  });

  it('menolak pesan rusak, tipe tak dikenal, dan versi lain', () => {
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage('halo')).toBeNull();
    expect(parseMessage({ v: 1, t: 'hack', n: 0, ts: 0, d: {} })).toBeNull();
    expect(parseMessage({ ...createMessage('ping', 0, {}), v: 2 })).toBeNull();
  });

  it('menolak payload yang tidak sesuai skema', () => {
    const longName = { ...hello, name: 'x'.repeat(MAX_NAME_LENGTH + 1) };
    expect(parseMessage(createMessage('hello', 0, longName))).toBeNull();

    const badColor = { v: 1, t: 'sync', n: 1, ts: 0, d: { ...sync, hostColor: 'red' } };
    expect(parseMessage(badColor)).toBeNull();

    const badSquare = {
      v: 1,
      t: 'move',
      n: 1,
      ts: 0,
      d: { game: 1, ply: 0, from: 'e9', to: 'e4', san: '', clockMs: null },
    };
    expect(parseMessage(badSquare)).toBeNull();

    const badPromotion = {
      v: 1,
      t: 'move',
      n: 1,
      ts: 0,
      d: { game: 1, ply: 0, from: 'e7', to: 'e8', promotion: 'k', san: '', clockMs: null },
    };
    expect(parseMessage(badPromotion)).toBeNull();

    const tooManyMoves = { ...sync, moves: Array(1001).fill({ from: 'e2', to: 'e4' }) };
    expect(parseMessage(createMessage('sync', 1, tooManyMoves))).toBeNull();

    expect(parseMessage({ v: 1, t: 'ack', n: 0, ts: 0, d: { n: -1 } })).toBeNull();
  });
});
