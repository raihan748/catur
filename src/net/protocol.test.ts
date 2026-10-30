import { describe, expect, it } from 'vitest';
import { createMessage, MAX_NAME_LENGTH, parseMessage } from './protocol.ts';

const hello = { name: 'Ani', clientId: 'c1', sessionId: 's1', protocol: 1 };

describe('protokol', () => {
  it('menerima pesan yang valid', () => {
    const msg = createMessage('hello', 0, hello);
    expect(parseMessage(msg)).toEqual(msg);

    const start = createMessage('start', 1, {
      hostColor: 'w',
      timeControl: { initialMs: 300_000, incrementMs: 0 },
      fen: 'startpos',
    });
    expect(parseMessage(start)?.t).toBe('start');
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

    const badColor = {
      v: 1,
      t: 'start',
      n: 1,
      ts: 0,
      d: { hostColor: 'red', timeControl: null, fen: '' },
    };
    expect(parseMessage(badColor)).toBeNull();

    expect(parseMessage({ v: 1, t: 'ack', n: 0, ts: 0, d: { n: -1 } })).toBeNull();
  });
});
