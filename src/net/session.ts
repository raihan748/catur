import {
  createMessage,
  parseMessage,
  PROTOCOL_VERSION,
  type ControlType,
  type Message,
  type Payload,
  type PeerMessage,
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
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'connecting'
  | 'connected'
  /** Tamu: terputus dan sedang mencoba menyambung ulang sendiri. */
  | 'reconnecting'
  /** Host: tamu terputus; menunggu ia tersambung kembali. */
  | 'disconnected'
  | 'error';

export type SessionErrorCode = TransportErrorCode | 'full' | 'version';

export type Identity = { name: string; clientId: string };

export type SessionHandlers = {
  onStatus?: (status: ConnectionStatus) => void;
  onPeer?: (peer: { name: string; clientId: string }) => void;
  /** Sambungan terbentuk atau pulih (kedua sisi sudah bertukar hello). */
  onConnect?: () => void;
  /** Pesan bernomor (permainan & obrolan), sudah lolos validasi dan bebas duplikat. */
  onMessage?: (message: PeerMessage) => void;
  /** Percobaan sambung ulang gagal karena galat sementara; akan dicoba lagi. */
  onRetry?: (code: SessionErrorCode) => void;
  /** Galat yang menghentikan sesi. */
  onError?: (code: SessionErrorCode) => void;
};

export type SessionOptions = {
  /**
   * Tamu: melanjutkan permainan tersimpan. Galat sementara pada percobaan pertama
   * (mis. host juga sedang memuat ulang) berarti coba lagi, bukan gagal.
   */
  resume?: boolean;
  /** Host: tamu yang sudah memegang kursi lawan (dipulihkan dari penyimpanan). */
  guestClientId?: string | null;
};

export const HEARTBEAT_MS = 5_000;
export const PEER_TIMEOUT_MS = 15_000;
export const HELLO_TIMEOUT_MS = 8_000;
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 10_000;
const REJECT_CLOSE_DELAY_MS = 500;

/** Galat yang bisa hilang sendiri: host sedang memuat ulang, jaringan putus sebentar. */
const TRANSIENT_ERRORS: ReadonlySet<SessionErrorCode> = new Set([
  'not-found',
  'unreachable',
  'network',
]);

const toErrorCode = (err: unknown): SessionErrorCode =>
  err instanceof TransportError ? err.code : 'network';

/**
 * Protokol di atas satu Channel: handshake hello, nomor urut + ack, buang
 * duplikat, dan heartbeat. Host hanya menerima satu tamu; setelah itu hanya
 * tamu yang sama (clientId sama) yang boleh tersambung ulang. Tamu yang pernah
 * tersambung menyambung ulang sendiri dengan jeda yang makin panjang. Isi
 * permainan diurus lapisan di atasnya (OnlineGame).
 */
export class Session {
  readonly role: Role;
  status: ConnectionStatus = 'idle';

  private readonly transport: Transport;
  private readonly identity: Identity;
  private readonly handlers: SessionHandlers;
  private readonly sessionId = crypto.randomUUID();

  private code = '';
  private channel: Channel | null = null;
  private guestClientId: string | null;
  private peerSessionId: string | null = null;
  private seq = 0;
  private lastSeen = 0;
  /** Pesan bernomor yang belum di-ack; dikirim ulang saat sambungan pulih. */
  private readonly pending = new Map<number, Message>();
  private lastHeard = 0;
  /** Tamu: galat sementara berarti coba lagi (sudah pernah tersambung, atau melanjutkan). */
  private autoReconnect: boolean;
  private reconnectAttempts = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    transport: Transport,
    role: Role,
    identity: Identity,
    handlers: SessionHandlers = {},
    options: SessionOptions = {},
  ) {
    this.transport = transport;
    this.role = role;
    this.identity = identity;
    this.handlers = handlers;
    this.guestClientId = options.guestClientId ?? null;
    this.autoReconnect = role === 'guest' && !!options.resume;
  }

  async host(code: string) {
    this.code = code;
    this.setStatus('creating');
    try {
      await this.transport.listen(code, (ch) => this.accept(ch));
      if (!this.closed) this.setStatus(this.guestClientId ? 'disconnected' : 'waiting');
    } catch (err) {
      this.fail(toErrorCode(err));
    }
  }

  /** Sambung ke host. */
  async join(code: string) {
    this.code = code;
    await this.attempt();
  }

  /** Kirim pesan bernomor; yang belum di-ack dikirim ulang setelah sambungan pulih. */
  send<T extends SequencedType>(t: T, d: Payload<T>) {
    const msg = createMessage(t, ++this.seq, d);
    this.pending.set(msg.n, msg);
    this.channel?.send(msg);
  }

  /**
   * Tab kembali terlihat atau jaringan kembali: periksa sambungan dengan ping,
   * atau langsung coba sambung ulang tanpa menunggu jeda.
   */
  wake() {
    if (this.closed) return;
    if (this.channel && this.status === 'connected') {
      this.sendControl('ping', {});
    } else if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectAttempts = 0;
      void this.attempt();
    }
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
      this.established();
    };
  }

  // --- tamu ---------------------------------------------------------------

  private async attempt() {
    this.reconnectTimer = null;
    this.setStatus(this.autoReconnect ? 'reconnecting' : 'connecting');
    try {
      const ch = await this.transport.connect(this.code);
      if (this.closed) return ch.close();
      this.attach(ch);
      this.sendControl('hello', this.helloPayload());
      // Tamu dianggap terhubung setelah host membalas hello.
      this.helloTimer = setTimeout(() => this.attemptFailed('unreachable'), HELLO_TIMEOUT_MS);
    } catch (err) {
      this.attemptFailed(toErrorCode(err));
    }
  }

  /** Percobaan tamu gagal: coba lagi nanti bila galatnya sementara, selain itu berhenti. */
  private attemptFailed(code: SessionErrorCode) {
    if (this.closed) return;
    if (!this.autoReconnect || !TRANSIENT_ERRORS.has(code)) return this.fail(code);
    this.detach()?.close();
    this.stopTimers();
    this.handlers.onRetry?.(code);
    this.setStatus('reconnecting');
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => void this.attempt(), delay);
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
        if (this.role === 'guest' && this.status !== 'connected') {
          this.clearHelloTimer();
          this.greet(msg.d);
          this.established();
        }
        return;
      case 'reject':
        this.fail(msg.d.reason);
        return;
    }

    this.sendControl('ack', { n: msg.n });
    if (msg.n <= this.lastSeen) return; // duplikat
    this.lastSeen = msg.n;
    this.handlers.onMessage?.(msg);
  }

  /** Kedua sisi sudah bertukar hello. */
  private established() {
    // Mulai sekarang tamu menyambung ulang sendiri bila putus.
    this.autoReconnect = this.role === 'guest';
    this.reconnectAttempts = 0;
    // Kirim ulang dulu pesan lama agar nomor urut tetap naik di sisi penerima.
    this.resendPending();
    this.setStatus('connected');
    this.handlers.onConnect?.();
  }

  private greet(hello: Payload<'hello'>) {
    // Peer memuat ulang halaman = sesi baru dengan nomor urut mulai dari awal.
    if (this.peerSessionId !== hello.sessionId) {
      this.peerSessionId = hello.sessionId;
      this.lastSeen = 0;
    }
    this.handlers.onPeer?.({ name: hello.name, clientId: hello.clientId });
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
    if (this.role === 'guest') this.attemptFailed('unreachable');
    else this.setStatus('disconnected');
  }

  private fail(code: SessionErrorCode) {
    if (this.closed) return;
    this.close();
    this.handlers.onError?.(code);
    this.setStatus('error');
  }

  private startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    let lastTick = Date.now();
    this.heartbeat = setInterval(() => {
      const ch = this.channel;
      if (!ch) return;
      const now = Date.now();
      // Timer sempat tertunda lama (tab tertidur di latar belakang): beri lawan
      // kesempatan membalas ping dulu sebelum dianggap putus.
      if (now - lastTick > 2 * HEARTBEAT_MS) {
        this.lastHeard = Math.max(this.lastHeard, now - PEER_TIMEOUT_MS + HEARTBEAT_MS);
      }
      lastTick = now;
      if (now - this.lastHeard > PEER_TIMEOUT_MS) {
        this.lost(ch);
        ch.close();
        return;
      }
      this.sendControl('ping', {});
    }, HEARTBEAT_MS);
  }

  private stopTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeat = null;
    this.reconnectTimer = null;
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
    if (status === this.status) return;
    this.status = status;
    this.handlers.onStatus?.(status);
  }
}
