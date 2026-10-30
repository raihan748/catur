import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessage, type PeerMessage } from './protocol.ts';
import {
  HEARTBEAT_MS,
  PEER_TIMEOUT_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  Session,
  type SessionErrorCode,
  type SessionOptions,
} from './session.ts';
import { TransportError, type Channel, type Transport } from './transport.ts';

// --- Transport tiruan di memori (asinkron seperti DataChannel sungguhan) -----

class MemoryChannel implements Channel {
  onData: ((data: unknown) => void) | null = null;
  onClose: (() => void) | null = null;
  peer: MemoryChannel | null = null;
  open = true;
  /** Simulasi jaringan macet: pesan keluar dibuang diam-diam. */
  muted = false;

  send(data: unknown) {
    const peer = this.peer;
    if (!this.open || this.muted || !peer) return;
    const copy: unknown = JSON.parse(JSON.stringify(data));
    queueMicrotask(() => {
      if (peer.open) peer.onData?.(copy);
    });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.onClose?.();
    const peer = this.peer;
    if (peer?.open) {
      peer.open = false;
      queueMicrotask(() => peer.onClose?.());
    }
  }
}

class MemoryHub {
  hosts = new Map<string, (ch: Channel) => void>();
  /** Sisi host dari setiap sambungan yang pernah dibuat. */
  hostSides: MemoryChannel[] = [];
}

class MemoryTransport implements Transport {
  private code: string | null = null;
  private readonly hub: MemoryHub;

  constructor(hub: MemoryHub) {
    this.hub = hub;
  }

  async listen(code: string, onChannel: (ch: Channel) => void) {
    if (this.hub.hosts.has(code)) throw new TransportError('code-taken');
    this.hub.hosts.set(code, onChannel);
    this.code = code;
  }

  async connect(code: string) {
    const host = this.hub.hosts.get(code);
    if (!host) throw new TransportError('not-found');
    const guestSide = new MemoryChannel();
    const hostSide = new MemoryChannel();
    guestSide.peer = hostSide;
    hostSide.peer = guestSide;
    this.hub.hostSides.push(hostSide);
    host(hostSide);
    return guestSide;
  }

  destroy() {
    if (this.code) this.hub.hosts.delete(this.code);
  }
}

// --- Bantuan -----------------------------------------------------------------

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const CODE = 'K7M2QX';

function makePlayer(
  hub: MemoryHub,
  role: 'host' | 'guest',
  name: string,
  clientId = name,
  options: SessionOptions = {},
) {
  const log = {
    statuses: [] as string[],
    errors: [] as SessionErrorCode[],
    retries: [] as SessionErrorCode[],
    connects: 0,
    messages: [] as PeerMessage[],
    peers: [] as string[],
  };
  const session = new Session(
    new MemoryTransport(hub),
    role,
    { name, clientId },
    {
      onStatus: (s) => log.statuses.push(s),
      onError: (e) => log.errors.push(e),
      onRetry: (e) => log.retries.push(e),
      onConnect: () => log.connects++,
      onMessage: (m) => log.messages.push(m),
      onPeer: (p) => log.peers.push(p.name),
    },
    options,
  );
  return { session, log };
}

async function connectedPair(hub = new MemoryHub()) {
  const host = makePlayer(hub, 'host', 'Ani');
  const guest = makePlayer(hub, 'guest', 'Budi');
  await host.session.host(CODE);
  await guest.session.join(CODE);
  await flush();
  return { hub, host, guest };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Session', () => {
  it('menyelesaikan handshake hello dan meneruskan pesan permainan', async () => {
    const { host, guest } = await connectedPair();

    expect(host.log.statuses).toEqual(['creating', 'waiting', 'connected']);
    expect(guest.log.statuses).toEqual(['connecting', 'connected']);
    expect(host.log.peers).toEqual(['Budi']);
    expect(guest.log.peers).toEqual(['Ani']);
    expect(host.log.connects).toBe(1);
    expect(guest.log.connects).toBe(1);

    host.session.send('resign', { game: 1 });
    await flush();
    expect(guest.log.messages.map((m) => m.t)).toEqual(['resign']);
  });

  it('melaporkan ruangan yang tidak ada', async () => {
    const guest = makePlayer(new MemoryHub(), 'guest', 'Budi');
    await guest.session.join('ZZZZZZ');
    expect(guest.log.errors).toEqual(['not-found']);
    expect(guest.session.status).toBe('error');
  });

  it('menolak pemain ketiga dengan "full"', async () => {
    const { hub, host } = await connectedPair();
    const intruder = makePlayer(hub, 'guest', 'Caca');

    await intruder.session.join(CODE);
    await flush();

    expect(intruder.log.errors).toEqual(['full']);
    expect(host.session.status).toBe('connected');
  });

  it('mengizinkan tamu yang sama tersambung ulang', async () => {
    const { hub, host, guest } = await connectedPair();
    guest.session.close();
    await flush();
    expect(host.session.status).toBe('disconnected');

    // Muat ulang halaman: Session baru, clientId sama.
    const again = makePlayer(hub, 'guest', 'Budi', 'Budi');
    await again.session.join(CODE);
    await flush();

    expect(again.log.errors).toEqual([]);
    expect(again.session.status).toBe('connected');
    expect(host.session.status).toBe('connected');
  });

  it('membuang pesan duplikat berdasarkan nomor urut', async () => {
    const { hub, guest } = await connectedPair();
    const hostSide = hub.hostSides[0]!;

    hostSide.send(createMessage('draw_offer', 1, { game: 1 }));
    hostSide.send(createMessage('draw_offer', 1, { game: 1 })); // nomor sama: duplikat
    hostSide.send(createMessage('draw_offer', 2, { game: 1 }));
    await flush();
    expect(guest.log.messages.map((m) => m.n)).toEqual([1, 2]);
  });

  it('mengirim ulang pesan yang belum di-ack setelah sambungan pulih', async () => {
    const { hub, host, guest } = await connectedPair();
    hub.hostSides[0]!.muted = true;
    host.session.send('draw_offer', { game: 1 }); // hilang di jalan
    guest.session.close();
    await flush();

    const again = makePlayer(hub, 'guest', 'Budi', 'Budi');
    await again.session.join(CODE);
    await flush();
    expect(again.log.messages.map((m) => m.t)).toEqual(['draw_offer']);
  });

  it('mengabaikan data rusak dari lawan', async () => {
    const { hub, guest } = await connectedPair();
    const hostSide = hub.hostSides[0]!;
    hostSide.send('bukan json protokol');
    hostSide.send({ v: 1, t: 'move', n: 9, ts: 0, d: { game: 1, from: 'z9', to: 'e4' } });
    await flush();
    expect(guest.session.status).toBe('connected');
    expect(guest.log.messages).toEqual([]);
  });

  it('mendeteksi lawan yang diam lewat heartbeat, lalu tamu menyambung ulang', async () => {
    const { hub, host, guest } = await connectedPair();
    hub.hostSides[0]!.muted = true; // pesan host tidak sampai lagi

    await vi.advanceTimersByTimeAsync(PEER_TIMEOUT_MS + HEARTBEAT_MS);
    await flush();
    expect(guest.session.status).toBe('reconnecting');
    expect(host.session.status).toBe('disconnected');

    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
    await flush();
    expect(guest.session.status).toBe('connected');
    expect(host.session.status).toBe('connected');
    expect(guest.log.connects).toBe(2);
  });

  it('tetap terhubung selama heartbeat berjalan', async () => {
    const { host, guest } = await connectedPair();
    await vi.advanceTimersByTimeAsync(PEER_TIMEOUT_MS * 3);
    expect(host.session.status).toBe('connected');
    expect(guest.session.status).toBe('connected');
  });

  it('tidak langsung memutus setelah tab tertidur', async () => {
    const { host, guest } = await connectedPair();
    // Timer tertahan satu menit (tab di latar belakang), lalu berjalan lagi.
    vi.setSystemTime(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await flush();
    expect(guest.session.status).toBe('connected');
    expect(host.session.status).toBe('connected');
  });

  it('tamu menunggu host yang memuat ulang, dan host mengingat tamunya', async () => {
    const { hub, host, guest } = await connectedPair();
    host.session.close(); // halaman host dimuat ulang
    await flush();
    expect(guest.session.status).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS); // host belum kembali
    await flush();
    expect(guest.log.retries).toContain('not-found');
    expect(guest.log.errors).toEqual([]);

    // Host baru dipulihkan dari penyimpanan: hanya tamu lama yang boleh masuk.
    const restored = makePlayer(hub, 'host', 'Ani', 'Ani', { guestClientId: 'Budi' });
    await restored.session.host(CODE);
    expect(restored.session.status).toBe('disconnected');

    const intruder = makePlayer(hub, 'guest', 'Caca');
    await intruder.session.join(CODE);
    await flush();
    expect(intruder.log.errors).toEqual(['full']);

    await vi.advanceTimersByTimeAsync(RECONNECT_MAX_MS);
    await flush();
    expect(guest.session.status).toBe('connected');
    expect(restored.session.status).toBe('connected');
  });

  it('tamu yang melanjutkan permainan mencoba lagi bila host belum ada', async () => {
    const hub = new MemoryHub();
    const guest = makePlayer(hub, 'guest', 'Budi', 'Budi', { resume: true });
    await guest.session.join(CODE);
    expect(guest.log.errors).toEqual([]);
    expect(guest.log.retries).toEqual(['not-found']);
    expect(guest.session.status).toBe('reconnecting');

    const host = makePlayer(hub, 'host', 'Ani');
    await host.session.host(CODE);
    guest.session.wake(); // tab terlihat lagi: coba sekarang, tanpa menunggu jeda
    await flush();
    expect(guest.session.status).toBe('connected');
  });

  it('berhenti menyambung ulang bila ditolak host', async () => {
    const { hub, host, guest } = await connectedPair();
    host.session.close();
    await flush();

    // Host lain (tanpa ingatan tamu lama) sudah menerima tamu berbeda.
    const other = makePlayer(hub, 'host', 'Ani', 'Ani', { guestClientId: 'Caca' });
    await other.session.host(CODE);
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
    await flush();

    expect(guest.log.errors).toEqual(['full']);
    expect(guest.session.status).toBe('error');
    await vi.advanceTimersByTimeAsync(RECONNECT_MAX_MS * 2);
    expect(guest.log.statuses.filter((s) => s === 'reconnecting')).toHaveLength(1);
  });
});
