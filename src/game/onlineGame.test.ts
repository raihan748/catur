import { describe, expect, it } from 'vitest';
import { createMessage, parseMessage, type GameMessage } from '../net/protocol.ts';
import type { Role } from '../net/session.ts';
import { OnlineGame, TIMEOUT_TOLERANCE_MS } from './onlineGame.ts';
import type { TimeControl } from './timeControl.ts';
import type { Color, MoveInput, Square } from './types.ts';

// Dua OnlineGame yang disambungkan lewat antrean pesan. Setiap pesan melewati
// parseMessage, jadi test juga memastikan yang dikirim selalu lolos skema.

type Player = { game: OnlineGame; sent: string[] };

function setup({ hostColor = 'w' as Color, timeControl = null as TimeControl | null } = {}) {
  let time = 0;
  let seq = 0;
  const queue: (() => void)[] = [];
  const players = {} as Record<Role, Player>;

  const make = (role: Role): Player => {
    const sent: string[] = [];
    const game = new OnlineGame({
      role,
      now: () => time,
      onChange: () => {},
      send: (t, d) => {
        sent.push(t);
        const msg = parseMessage(createMessage(t, ++seq, d));
        if (!msg) throw new Error(`Pesan tidak lolos skema: ${t}`);
        const peer = role === 'host' ? 'guest' : 'host';
        queue.push(() => players[peer].game.receive(msg as GameMessage));
      },
    });
    return { game, sent };
  };

  players.host = make('host');
  players.guest = make('guest');
  const deliver = () => {
    while (queue.length) queue.shift()!();
  };

  players.host.game.setConnected(true);
  players.guest.game.setConnected(true);
  players.host.game.startNew(hostColor, timeControl);
  deliver();

  return {
    host: players.host,
    guest: players.guest,
    deliver,
    advance: (ms: number) => (time += ms),
    /** Pemain yang memegang warna tertentu. */
    by: (color: Color) => (players.host.game.myColor === color ? players.host : players.guest),
  };
}

const uci = (m: string): MoveInput => ({
  from: m.slice(0, 2) as Square,
  to: m.slice(2, 4) as Square,
});

/** Mainkan langkah bergantian sesuai warna yang sedang melangkah. */
function play(ctx: ReturnType<typeof setup>, moves: string[]) {
  for (const m of moves) {
    const turn = ctx.host.game.view().snapshot.turn;
    if (!ctx.by(turn).game.move(uci(m))) throw new Error(`Langkah ditolak: ${m}`);
    ctx.deliver();
  }
}

const inject = (to: Player, t: GameMessage['t'], d: unknown) =>
  to.game.receive(parseMessage(createMessage(t, 999, d as never)) as GameMessage);

describe('OnlineGame', () => {
  it('tamu menerima permainan dari host lewat sync', () => {
    const { host, guest } = setup({
      hostColor: 'b',
      timeControl: { initialMs: 60_000, incrementMs: 0 },
    });
    expect(guest.game.view().game).toBe(1);
    expect(host.game.myColor).toBe('b');
    expect(guest.game.myColor).toBe('w');
    expect(guest.game.view().timeControl).toEqual({ initialMs: 60_000, incrementMs: 0 });
  });

  it("memainkan Fool's mate sampai skakmat di kedua sisi", () => {
    const ctx = setup({ hostColor: 'b' });
    play(ctx, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);

    const expected = { winner: 'b', reason: 'checkmate' };
    expect(ctx.host.game.view().result).toEqual(expected);
    expect(ctx.guest.game.view().result).toEqual(expected);
    expect(ctx.guest.game.view().snapshot.fen).toBe(ctx.host.game.view().snapshot.fen);
  });

  it('menolak langkah di giliran lawan atau dengan bidak lawan', () => {
    const { host, guest } = setup({ hostColor: 'w' });
    expect(guest.game.move(uci('e7e5'))).toBe(false); // bukan giliran hitam
    expect(host.game.move(uci('e7e5'))).toBe(false); // bidak lawan
    expect(guest.game.legalTargets('e7')).toEqual([]);
    expect(
      host.game
        .legalTargets('e2')
        .map((t) => t.to)
        .sort(),
    ).toEqual(['e3', 'e4']);
  });

  it('langkah ilegal dari tamu memicu sync dari host', () => {
    const { host, guest, deliver } = setup({ hostColor: 'b' });
    // Tamu (putih) "mengirim" langkah ilegal e2-e5.
    inject(host, 'move', { game: 1, ply: 0, from: 'e2', to: 'e5', san: 'e5', clockMs: null });
    expect(host.sent.at(-1)).toBe('sync');
    deliver();
    expect(host.game.view().snapshot.moves).toEqual([]);
    expect(guest.game.view().snapshot.fen).toBe(host.game.view().snapshot.fen);
  });

  it('tamu yang menerima langkah aneh meminta sync dari host', () => {
    const ctx = setup({ hostColor: 'w' });
    play(ctx, ['e2e4']);
    // Langkah "host" untuk ply yang salah sampai ke tamu.
    inject(ctx.guest, 'move', { game: 1, ply: 5, from: 'd2', to: 'd4', san: 'd4', clockMs: null });
    expect(ctx.guest.sent.at(-1)).toBe('sync_request');
    ctx.deliver();
    expect(ctx.host.sent.at(-1)).toBe('sync');
    expect(ctx.guest.game.view().snapshot.fen).toBe(ctx.host.game.view().snapshot.fen);
  });

  it('mengabaikan langkah lama yang dikirim ulang', () => {
    const ctx = setup({ hostColor: 'w' });
    play(ctx, ['e2e4', 'e7e5']);
    inject(ctx.guest, 'move', { game: 1, ply: 0, from: 'e2', to: 'e4', san: 'e4', clockMs: null });
    expect(ctx.guest.sent.at(-1)).not.toBe('sync_request');
    expect(ctx.guest.game.view().snapshot.moves).toHaveLength(2);
  });

  it('menyerah mengakhiri permainan di kedua sisi', () => {
    const { host, guest, deliver } = setup({ hostColor: 'w' });
    guest.game.resign();
    deliver();
    const expected = { winner: 'w', reason: 'resign' };
    expect(guest.game.view().result).toEqual(expected);
    expect(host.game.view().result).toEqual(expected);
  });

  it('tawaran remis bisa ditolak lalu diterima', () => {
    const { host, guest, deliver } = setup();
    host.game.offerDraw();
    deliver();
    expect(guest.game.view().drawOffer).toBe('them');

    guest.game.declineDraw();
    deliver();
    expect(host.game.view().drawOffer).toBeNull();
    expect(host.game.view().notice?.text).toBe('Lawan menolak tawaran remis.');

    guest.game.offerDraw();
    deliver();
    host.game.acceptDraw();
    deliver();
    expect(host.game.view().result).toEqual({ reason: 'agreement' });
    expect(guest.game.view().result).toEqual({ reason: 'agreement' });
  });

  it('melangkah menolak tawaran remis lawan, tawaran sendiri tetap berlaku', () => {
    const ctx = setup({ hostColor: 'w' });
    ctx.host.game.offerDraw(); // putih menawarkan lalu melangkah
    play(ctx, ['e2e4']);
    expect(ctx.guest.game.view().drawOffer).toBe('them');

    play(ctx, ['e7e5']); // hitam melangkah tanpa menjawab = menolak
    expect(ctx.host.game.view().drawOffer).toBeNull();
    expect(ctx.guest.game.view().drawOffer).toBeNull();
  });

  it('tawaran remis bersamaan dianggap sepakat', () => {
    const { host, guest, deliver } = setup();
    host.game.offerDraw();
    guest.game.offerDraw();
    deliver();
    expect(host.game.view().result).toEqual({ reason: 'agreement' });
    expect(guest.game.view().result).toEqual({ reason: 'agreement' });
  });

  it('batal hanya boleh sebelum langkah kedua', () => {
    const ctx = setup({ hostColor: 'w' });
    play(ctx, ['e2e4']);
    expect(ctx.guest.game.view().canAbort).toBe(true);
    ctx.guest.game.abort();
    ctx.deliver();
    expect(ctx.host.game.view().result).toEqual({ reason: 'aborted' });

    const later = setup({ hostColor: 'w' });
    play(later, ['e2e4', 'e7e5']);
    expect(later.host.game.view().canAbort).toBe(false);
    later.host.game.abort();
    expect(later.host.game.view().result).toBeUndefined();
  });

  it('rematch memulai permainan baru dengan warna ditukar', () => {
    const ctx = setup({ hostColor: 'w', timeControl: { initialMs: 60_000, incrementMs: 0 } });
    play(ctx, ['e2e4']);
    ctx.guest.game.resign();
    ctx.deliver();

    ctx.guest.game.offerRematch();
    ctx.deliver();
    expect(ctx.host.game.view().rematch).toBe('them');
    ctx.host.game.acceptRematch();
    ctx.deliver();

    for (const p of [ctx.host, ctx.guest]) {
      const v = p.game.view();
      expect(v.game).toBe(2);
      expect(v.result).toBeUndefined();
      expect(v.snapshot.moves).toEqual([]);
      expect(v.clocks).toEqual({ w: 60_000, b: 60_000 });
    }
    expect(ctx.host.game.myColor).toBe('b');
    expect(ctx.guest.game.myColor).toBe('w');
  });

  it('menghitung jam dan increment, dan melaporkannya ke lawan', () => {
    const ctx = setup({ hostColor: 'w', timeControl: { initialMs: 180_000, incrementMs: 2_000 } });
    play(ctx, ['e2e4']); // langkah pertama putih tidak dihitung
    expect(ctx.guest.game.view().clocks).toEqual({ w: 180_000, b: 180_000 });

    ctx.advance(3_000);
    play(ctx, ['e7e5']);
    expect(ctx.host.game.view().clocks?.b).toBe(180_000 - 3_000 + 2_000);

    ctx.advance(5_000);
    play(ctx, ['g1f3']);
    expect(ctx.guest.game.view().clocks?.w).toBe(180_000 - 5_000 + 2_000);
  });

  it('tidak menerima laporan jam yang menambah waktu sendiri', () => {
    const ctx = setup({ hostColor: 'w', timeControl: { initialMs: 300_000, incrementMs: 0 } });
    play(ctx, ['e2e4']);
    inject(ctx.host, 'move', {
      game: 1,
      ply: 1,
      from: 'e7',
      to: 'e5',
      san: 'e5',
      clockMs: 400_000,
    });
    expect(ctx.host.game.view().clocks?.b).toBe(300_000);
  });

  it('menyatakan waktu habis dan lawan menerimanya', () => {
    const ctx = setup({ hostColor: 'w', timeControl: { initialMs: 60_000, incrementMs: 0 } });
    play(ctx, ['e2e4']); // jam hitam (tamu) mulai berjalan

    ctx.advance(60_001);
    ctx.host.game.tick();
    ctx.deliver();
    const expected = { winner: 'w', reason: 'timeout' };
    expect(ctx.host.game.view().result).toEqual(expected);
    expect(ctx.guest.game.view().result).toEqual(expected);
    expect(ctx.guest.game.move(uci('e7e5'))).toBe(false);
  });

  it('mengabaikan klaim waktu habis yang terlalu dini', () => {
    const ctx = setup({ hostColor: 'w', timeControl: { initialMs: 60_000, incrementMs: 0 } });
    play(ctx, ['e2e4']);
    ctx.advance(60_000 - TIMEOUT_TOLERANCE_MS - 5_000);
    inject(ctx.guest, 'timeout', { game: 1, color: 'b' });
    expect(ctx.guest.game.view().result).toBeUndefined();
  });

  it('menjeda jam selama sambungan terputus', () => {
    const ctx = setup({ hostColor: 'w', timeControl: { initialMs: 60_000, incrementMs: 0 } });
    play(ctx, ['e2e4']);
    ctx.advance(10_000);
    ctx.guest.game.setConnected(false);
    ctx.advance(120_000); // lama terputus, jam tidak boleh habis
    ctx.guest.game.setConnected(true);
    ctx.guest.game.tick();
    expect(ctx.guest.game.view().result).toBeUndefined();
    expect(ctx.guest.game.view().clocks?.b).toBe(50_000);
  });

  it('mengabaikan pesan dari permainan sebelumnya', () => {
    const { host } = setup();
    inject(host, 'resign', { game: 7 });
    expect(host.game.view().result).toBeUndefined();
  });
});
