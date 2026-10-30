import Peer, { type DataConnection } from 'peerjs';
import {
  TransportError,
  type Channel,
  type Transport,
  type TransportErrorCode,
} from './transport.ts';

/** Awalan ID agar kode ruangan tidak bertabrakan dengan aplikasi lain di server PeerJS publik. */
const ID_PREFIX = 'catur-v1-';
const CONNECT_TIMEOUT_MS = 20_000;
const SIGNALING_RETRY_MS = 3_000;

// Hanya STUN publik; TURN sengaja tidak dipakai (PRD F14).
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const ERROR_CODES: Partial<Record<string, TransportErrorCode>> = {
  'unavailable-id': 'code-taken',
  'peer-unavailable': 'not-found',
  'browser-incompatible': 'unsupported',
  webrtc: 'unreachable',
  'negotiation-failed': 'unreachable',
};

const toTransportError = (err: unknown) => {
  const type = (err as { type?: string } | null)?.type ?? '';
  return new TransportError(ERROR_CODES[type] ?? 'network', String(err));
};

class PeerChannel implements Channel {
  onData: ((data: unknown) => void) | null = null;
  onClose: (() => void) | null = null;
  private readonly conn: DataConnection;

  constructor(conn: DataConnection) {
    this.conn = conn;
    conn.on('data', (data) => this.onData?.(data));
    conn.on('close', () => this.onClose?.());
    conn.on('error', () => conn.close());
  }

  send(data: unknown) {
    if (this.conn.open) void this.conn.send(data);
  }

  close() {
    this.conn.close();
  }
}

export class PeerJsTransport implements Transport {
  private peer: Peer | null = null;

  listen(code: string, onChannel: (channel: Channel) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = this.createPeer(ID_PREFIX + code);
      peer.once('open', () => resolve());
      peer.on('error', (err) => reject(toTransportError(err)));
      peer.on('connection', (conn) => {
        conn.once('open', () => onChannel(new PeerChannel(conn)));
      });
      // Sambungan ke server signaling putus: daftar ulang agar tamu tetap bisa masuk.
      // Sambungan data yang sudah terbuka tidak terpengaruh.
      peer.on('disconnected', () => {
        setTimeout(() => {
          if (!peer.destroyed && peer.disconnected) peer.reconnect();
        }, SIGNALING_RETRY_MS);
      });
    });
  }

  connect(code: string): Promise<Channel> {
    return new Promise((resolve, reject) => {
      const peer = this.createPeer();
      const fail = (err: TransportError) => {
        clearTimeout(timer);
        reject(err);
      };
      const timer = setTimeout(() => fail(new TransportError('unreachable')), CONNECT_TIMEOUT_MS);

      peer.on('error', (err) => fail(toTransportError(err)));
      peer.once('open', () => {
        const conn = peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'json' });
        conn.once('open', () => {
          clearTimeout(timer);
          resolve(new PeerChannel(conn));
        });
        conn.on('error', (err) => fail(toTransportError(err)));
      });
    });
  }

  destroy() {
    this.peer?.destroy();
    this.peer = null;
  }

  private createPeer(id?: string): Peer {
    this.destroy();
    // debug 0: galat sudah ditangani & ditampilkan aplikasi; jangan penuhi console pengguna.
    const options = { config: { iceServers: ICE_SERVERS }, debug: 0 };
    this.peer = id ? new Peer(id, options) : new Peer(options);
    return this.peer;
  }
}
