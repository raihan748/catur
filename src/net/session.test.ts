import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessage } from './protocol.ts';
import {
  HEARTBEAT_MS,
  PEER_TIMEOUT_MS,
  Session,
  type SessionErrorCode,
  type StartInfo,
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
const SETTINGS = { hostColor: 'b' as const, timeControl: { initialMs: 300_000, incrementMs: 0 } };

function makePlayer(hub: MemoryHub, role: 'host' | 'guest', name: string, clientId = name) {
  const log = {
    statuses: [] as string[],
    errors: [] as SessionErrorCode[],
    starts: [] as StartInfo[],
    peers: [] as string[],
  };
  const session = new Session(
    new MemoryTransport(hub),
    role,
    { name, clientId },
    {
      onStatus: (s) => log.statuses.push(s),
      onError: (e) => log.errors.push(e),
      onStart: (s) => log.starts.push(s),
      onPeer: (p) => log.peers.push(p.name),
    },
  );
  return { session, log };
}

async function connectedPair(hub = new MemoryHub()) {
  const host = makePlayer(hub, 'host', 'Ani');
  const guest = makePlayer(hub, 'guest', 'Budi');
  await host.session.host(CODE, SETTINGS);
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
  it('menyelesaikan handshake hello + start', async () => {
    const { host, guest } = await connectedPair();

    expect(host.log.statuses).toEqual(['creating', 'waiting', 'connected']);
    expect(guest.log.statuses).toEqual(['connecting', 'connected']);
    expect(host.log.peers).toEqual(['Budi']);
    expect(guest.log.peers).toEqual(['Ani']);
    expect(guest.log.starts).toHaveLength(1);
    expect(guest.log.starts[0]).toMatchObject({
      hostColor: 'b',
      timeControl: { initialMs: 300_000, incrementMs: 0 },
    });
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
    const start = { hostColor: 'w' as const, timeControl: null, fen: 'x' };

    hostSide.send(createMessage('start', 1, start)); // nomor 1 sudah diterima
    await flush();
    expect(guest.log.starts).toHaveLength(1);

    hostSide.send(createMessage('start', 2, start));
    await flush();
    expect(guest.log.starts).toHaveLength(2);
  });

  it('mengabaikan data rusak dari lawan', async () => {
    const { hub, guest } = await connectedPair();
    const hostSide = hub.hostSides[0]!;
    hostSide.send('bukan json protokol');
    hostSide.send({ v: 1, t: 'start', n: 9, ts: 0, d: { hostColor: 'ungu' } });
    await flush();
    expect(guest.session.status).toBe('connected');
    expect(guest.log.starts).toHaveLength(1);
  });

  it('mendeteksi lawan yang diam lewat heartbeat', async () => {
    const { hub, host, guest } = await connectedPair();
    hub.hostSides[0]!.muted = true; // pesan host tidak sampai lagi

    await vi.advanceTimersByTimeAsync(PEER_TIMEOUT_MS + 2 * HEARTBEAT_MS);
    await flush();

    expect(guest.session.status).toBe('disconnected');
    expect(host.session.status).toBe('disconnected');
  });

  it('tetap terhubung selama heartbeat berjalan', async () => {
    const { host, guest } = await connectedPair();
    await vi.advanceTimersByTimeAsync(PEER_TIMEOUT_MS * 3);
    expect(host.session.status).toBe('connected');
    expect(guest.session.status).toBe('connected');
  });
});
