export type TransportErrorCode =
  'code-taken' | 'not-found' | 'unreachable' | 'network' | 'unsupported';

export class TransportError extends Error {
  readonly code: TransportErrorCode;

  constructor(code: TransportErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'TransportError';
    this.code = code;
  }
}

/** Satu sambungan data dua arah (andal & berurutan) ke satu peer. */
export interface Channel {
  send(data: unknown): void;
  close(): void;
  onData: ((data: unknown) => void) | null;
  /** Dipanggil saat sambungan ditutup oleh sisi mana pun. */
  onClose: (() => void) | null;
}

/** Lapisan sambungan P2P, diabstraksikan agar PeerJS bisa diganti (mis. Trystero). */
export interface Transport {
  /** Daftarkan kode ruangan lalu terima sambungan masuk. Resolve setelah kode terdaftar. */
  listen(code: string, onChannel: (channel: Channel) => void): Promise<void>;
  /** Sambung ke ruangan. Resolve dengan channel yang sudah terbuka. */
  connect(code: string): Promise<Channel>;
  destroy(): void;
}
