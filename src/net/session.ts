import type { TimeControl } from '../game/timeControl.ts';
import type { Color } from '../game/types.ts';
import {
  createMessage,
  parseMessage,
  PROTOCOL_VERSION,
  type ControlType,
  type Message,
  type Payload,
  type SequencedType,
} from './protocol.ts';
import {
  TransportError,
  type Channel,
  type Transport,
  type TransportErrorCode,
} from './transport.ts';

export type Role = 'host' | 'guest';

export type ConnectionStatus =
  'idle' | 'creating' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type SessionErrorCode = TransportErrorCode | 'full' | 'version';

export type Identity = { name: string; clientId: string };

export type RoomSettings = { hostColor: Color; timeControl: TimeControl | null };

export type StartInfo = Payload<'start'>;

export type SessionHandlers = {
  onStatus?: (status: ConnectionStatus) => void;
  onPeer?: (peer: { name: string }) => void;
  onStart?: (start: StartInfo) => void;
  onMessage?: (message: Message) => void;
  onError?: (code: SessionErrorCode) => void;
};

export const HEARTBEAT_MS = 5_000;
export const PEER_TIMEOUT_MS = 15_000;
export const HELLO_TIMEOUT_MS = 8_000;
const REJECT_CLOSE_DELAY_MS = 500;
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const toErrorCode = (err: unknown): SessionErrorCode =>
  err instanceof TransportError ? err.code : 'network';

/**
 * Protokol di atas satu Channel: handshake hello/start, nomor urut + ack,
 * buang duplikat, dan heartbeat. Host hanya menerima satu tamu; setelah itu
 * hanya tamu yang sama (clientId sama) yang boleh tersambung ulang.
 */
export class Session {
  readonly role: Role;
  status: ConnectionStatus = 'idle';

  private readonly transport: Transport;
  private readonly identity: Identity;
  private readonly handlers: SessionHandlers;
  private readonly sessionId = crypto.randomUUID();

  private channel: Channel | null = null;
  private settings: RoomSettings | null = null;
  private guestClientId: string | null = null;
  private peerSessionId: string | null = null;
  private seq = 0;
  private lastSeen = 0;
  /** Pesan bernomor yang belum di-ack; dikirim ulang saat sambungan pulih. */
  private readonly pending = new Map<number, Message>();
  private lastHeard = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    transport: Transport,
    role: Role,
    identity: Identity,
    handlers: SessionHandlers = {},
  ) {
    this.transport = transport;
    this.role = role;
    this.identity = identity;
    this.handlers = handlers;
  }

  async host(code: string, settings: RoomSettings) {
    this.settings = settings;
    this.setStatus('creating');
    try {
      await this.transport.listen(code, (ch) => this.accept(ch));
      if (!this.closed) this.setStatus('waiting');
    } catch (err) {
      this.fail(toErrorCode(err));
    }
  }

  /** Sambung (atau sambung ulang) ke host. */
  async join(code: string) {
    this.setStatus('connecting');
    try {
      const ch = await this.transport.connect(code);
      if (this.closed) return ch.close();
      this.attach(ch);
      this.sendControl('hello', this.helloPayload());
      // Tamu dianggap terhubung setelah host membalas hello + start.
      this.helloTimer = setTimeout(() => this.fail('unreachable'), HELLO_TIMEOUT_MS);
    } catch (err) {
      this.fail(toErrorCode(err));
    }
  }

  /** Kirim pesan bernomor; yang belum di-ack dikirim ulang setelah sambungan pulih. */
  send<T extends SequencedType>(t: T, d: Payload<T>) {
    const msg = createMessage(t, ++this.seq, d);
    this.pending.set(msg.n, msg);
    this.channel?.send(msg);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopTimers();
    this.detach()?.close();
    this.transport.destroy();
  }

  // --- host ---------------------------------------------------------------

  private accept(ch: Channel) {
    if (this.closed) return ch.close();
    const timer = setTimeout(() => ch.close(), HELLO_TIMEOUT_MS);
    ch.onClose = () => clearTimeout(timer);
    ch.onData = (raw) => {
      const msg = parseMessage(raw);
      if (msg?.t !== 'hello') return;
      clearTimeout(timer);

      const reason =
        msg.d.protocol !== PROTOCOL_VERSION
          ? 'version'
          : this.guestClientId && this.guestClientId !== msg.d.clientId
            ? 'full'
            : null;
      if (reason) {
        ch.onData = null;
        ch.send(createMessage('reject', 0, { reason }));
        setTimeout(() => ch.close(), REJECT_CLOSE_DELAY_MS);
        return;
      }

      // Tamu baru, atau tamu yang sama tersambung ulang: ganti sambungan lama.
      this.guestClientId = msg.d.clientId;
      this.detach()?.close();
      this.attach(ch);
      this.greet(msg.d);
      this.sendControl('hello', this.helloPayload());
      // Kirim ulang dulu pesan lama agar urutan nomor tetap naik di sisi penerima.
      this.resendPending();
      const { hostColor, timeControl } = this.settings!;
      this.send('start', { hostColor, timeControl, fen: INITIAL_FEN });
      this.setStatus('connected');
    };
  }

  // --- bersama ------------------------------------------------------------

  private receive(raw: unknown) {
    const msg = parseMessage(raw);
    if (!msg) return;
    this.lastHeard = Date.now();

    switch (msg.t) {
      case 'ping':
        this.sendControl('pong', {});
        return;
      case 'pong':
        return;
      case 'ack':
        this.pending.delete(msg.d.n);
        return;
      case 'hello':
        if (this.role === 'guest') this.greet(msg.d);
        return;
      case 'reject':
        this.fail(msg.d.reason);
        return;
    }

    this.sendControl('ack', { n: msg.n });
    if (msg.n <= this.lastSeen) return; // duplikat
    this.lastSeen = msg.n;

    if (msg.t === 'start') {
      if (this.role !== 'guest') return;
      this.clearHelloTimer();
      this.handlers.onStart?.(msg.d);
      this.resendPending();
      this.setStatus('connected');
      return;
    }
    this.handlers.onMessage?.(msg);
  }

  private greet(hello: Payload<'hello'>) {
    // Peer memuat ulang halaman = sesi baru dengan nomor urut mulai dari awal.
    if (this.peerSessionId !== hello.sessionId) {
      this.peerSessionId = hello.sessionId;
      this.lastSeen = 0;
    }
    this.handlers.onPeer?.({ name: hello.name });
  }

  private attach(ch: Channel) {
    this.channel = ch;
    ch.onData = (raw) => this.receive(raw);
    ch.onClose = () => this.lost(ch);
    this.lastHeard = Date.now();
    this.startHeartbeat();
  }

  private detach(): Channel | null {
    const ch = this.channel;
    if (!ch) return null;
    ch.onData = null;
    ch.onClose = null;
    this.channel = null;
    return ch;
  }

  private lost(ch: Channel) {
    if (ch !== this.channel || this.closed) return;
    this.detach();
    this.stopTimers();
    this.setStatus('disconnected');
  }

  private fail(code: SessionErrorCode) {
    if (this.closed) return;
    this.close();
    this.handlers.onError?.(code);
    this.setStatus('error');
  }

  private startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      const ch = this.channel;
      if (!ch) return;
      if (Date.now() - this.lastHeard > PEER_TIMEOUT_MS) {
        this.lost(ch);
        ch.close();
        return;
      }
      this.sendControl('ping', {});
    }, HEARTBEAT_MS);
  }

  private stopTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.clearHelloTimer();
  }

  private clearHelloTimer() {
    if (this.helloTimer) clearTimeout(this.helloTimer);
    this.helloTimer = null;
  }

  private resendPending() {
    for (const msg of this.pending.values()) this.channel?.send(msg);
  }

  private sendControl<T extends ControlType>(t: T, d: Payload<T>) {
    this.channel?.send(createMessage(t, 0, d));
  }

  private helloPayload(): Payload<'hello'> {
    return {
      name: this.identity.name,
      clientId: this.identity.clientId,
      sessionId: this.sessionId,
      protocol: PROTOCOL_VERSION,
    };
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.handlers.onStatus?.(status);
  }
}
