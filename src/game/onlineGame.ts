import type { GameMessage, Payload, SequencedType } from '../net/protocol.ts';
import type { Role } from '../net/session.ts';
import { GameEngine, opposite } from './engine.ts';
import type { TimeControl } from './timeControl.ts';
import type { Color, GameResult, GameSnapshot, LegalTarget, MoveInput, Square } from './types.ts';

/** Siapa yang mengajukan tawaran (remis/rematch); 'starting' = rematch disepakati. */
export type Offer = 'me' | 'them' | null;
export type RematchState = Offer | 'starting';

export type OnlineGameView = {
  /** Nomor permainan; 0 = tamu belum menerima permainan dari host. */
  game: number;
  myColor: Color;
  timeControl: TimeControl | null;
  snapshot: GameSnapshot;
  result?: GameResult;
  /** Sisa jam saat giliran sekarang dimulai; null = tanpa jam. */
  clocks: Record<Color, number> | null;
  clockRunning: boolean;
  /** `now()` saat giliran sekarang dimulai (dasar hitung jam yang berjalan). */
  turnStartedAt: number;
  canPlay: boolean;
  canAbort: boolean;
  drawOffer: Offer;
  rematch: RematchState;
  /**
   * `now()` saat lawan yang terputus boleh dinyatakan meninggalkan permainan
   * (lihat `claimAbandon`); null bila tidak sedang menunggu lawan.
   */
  abandonAt: number | null;
  /** Pemberitahuan singkat untuk toast; id berubah tiap pemberitahuan baru. */
  notice: { id: number; text: string } | null;
};

type SendFn = <T extends SequencedType>(t: T, d: Payload<T>) => void;

type OnlineGameOptions = {
  role: Role;
  send: SendFn;
  onChange: () => void;
  now?: () => number;
};

/** Selisih jam yang masih diterima saat lawan menyatakan waktu habis (latensi jaringan). */
export const TIMEOUT_TOLERANCE_MS = 1_500;

/** Lama lawan terputus sebelum kemenangan boleh diklaim. */
export const ABANDON_MS = 60_000;

/**
 * Logika satu permainan online di satu sisi. Aturan dijalankan di kedua sisi;
 * bila posisi berbeda, host menjadi sumber kebenaran lewat pesan `sync`.
 * Tidak bergantung pada React maupun jaringan sehingga bisa diuji langsung.
 */
export class OnlineGame {
  private readonly role: Role;
  private readonly send: SendFn;
  private readonly onChange: () => void;
  private readonly now: () => number;

  private engine = new GameEngine();
  private game = 0;
  private hostColor: Color = 'w';
  private timeControl: TimeControl | null = null;
  private clocks: Record<Color, number> | null = null;
  private turnStartedAt = 0;
  /** Hasil di luar papan: menyerah, waktu habis, remis sepakat, batal. */
  private endResult: GameResult | null = null;
  private drawOffer: Offer = null;
  private rematch: RematchState = null;
  private connected = false;
  /** `now()` saat sambungan putus; null = belum pernah tersambung atau sedang tersambung. */
  private disconnectedAt: number | null = null;
  private notice: { id: number; text: string } | null = null;

  constructor({ role, send, onChange, now = () => performance.now() }: OnlineGameOptions) {
    this.role = role;
    this.send = send;
    this.onChange = onChange;
    this.now = now;
  }

  get myColor(): Color {
    return this.role === 'host' ? this.hostColor : opposite(this.hostColor);
  }

  private get started() {
    return this.game > 0;
  }

  private get canPlay() {
    return this.connected && this.started && !this.result() && this.engine.turn === this.myColor;
  }

  private get canAbort() {
    return this.started && !this.result() && this.engine.ply < 2;
  }

  /** Jam berjalan setelah langkah pertama putih, dan berhenti saat sambungan putus. */
  private get clockRunning() {
    return !!this.clocks && this.connected && !this.result() && this.engine.ply >= 1;
  }

  private get abandonAt() {
    if (this.connected || this.disconnectedAt === null || !this.started || this.result()) {
      return null;
    }
    return this.disconnectedAt + ABANDON_MS;
  }

  result(): GameResult | undefined {
    return this.endResult ?? this.engine.result();
  }

  view(): OnlineGameView {
    return {
      game: this.game,
      myColor: this.myColor,
      timeControl: this.timeControl,
      snapshot: this.engine.snapshot(),
      ...(this.result() && { result: this.result() }),
      clocks: this.clocks && { ...this.clocks },
      clockRunning: this.clockRunning,
      turnStartedAt: this.turnStartedAt,
      canPlay: this.canPlay,
      canAbort: this.canAbort,
      drawOffer: this.drawOffer,
      rematch: this.rematch,
      abandonAt: this.abandonAt,
      notice: this.notice,
    };
  }

  /** Keadaan lengkap (isi `sync`, juga yang disimpan); null sebelum permainan dimulai. */
  state(): Payload<'sync'> | null {
    if (!this.started) return null;
    return {
      game: this.game,
      hostColor: this.hostColor,
      timeControl: this.timeControl,
      moves: this.engine.moveList(),
      clocks: this.clocks && this.currentClocks(),
      result: this.result() ?? null,
    };
  }

  /** Pulihkan keadaan tersimpan setelah halaman dimuat ulang; jam dijeda sampai tersambung. */
  restore(state: Payload<'sync'>) {
    if (!this.load(state)) return;
    this.disconnectedAt = this.now();
    this.changed();
  }

  // --- Sambungan -----------------------------------------------------------

  setConnected(connected: boolean) {
    if (connected === this.connected) return;
    const now = this.now();
    // Jam dijeda selama terputus: catat waktu yang sudah terpakai, lalu mulai hitung lagi.
    if (!connected && this.clockRunning && this.clocks) {
      const turn = this.engine.turn;
      this.clocks[turn] = Math.max(0, this.remaining(turn, now));
    }
    this.connected = connected;
    this.turnStartedAt = now;
    this.disconnectedAt = connected ? null : now;
    // Tamu meminta keadaan lengkap setiap kali tersambung. Pesan yang tertunda selama
    // terputus (mis. menyerah) dikirim ulang lebih dulu, jadi balasan host sudah memuatnya.
    if (connected && this.role === 'guest') this.send('sync_request', {});
    this.changed();
  }

  // --- Host ----------------------------------------------------------------

  /** Host: mulai permainan baru (pertama atau rematch) lalu kirim ke tamu. */
  startNew(hostColor: Color, timeControl: TimeControl | null) {
    if (this.role !== 'host') return;
    this.game += 1;
    this.hostColor = hostColor;
    this.timeControl = timeControl;
    this.engine = new GameEngine();
    this.clocks = timeControl ? { w: timeControl.initialMs, b: timeControl.initialMs } : null;
    this.turnStartedAt = this.now();
    this.endResult = null;
    this.drawOffer = null;
    this.rematch = null;
    this.sendSync();
    this.changed();
  }

  /** Host: kirim keadaan lengkap ke tamu (diminta, posisi berbeda, atau permainan baru). */
  sendSync() {
    const state = this.state();
    if (this.role !== 'host' || !state) return;
    // Tawaran yang sedang berjalan dibatalkan agar kedua sisi kembali sama.
    this.drawOffer = null;
    if (this.rematch !== 'starting') this.rematch = null;
    this.send('sync', state);
  }

  // --- Aksi pemain ---------------------------------------------------------

  legalTargets(from: Square): LegalTarget[] {
    return this.canPlay ? this.engine.legalTargets(from) : [];
  }

  move(input: MoveInput): boolean {
    if (!this.canPlay || this.flagIfExpired()) return false;
    const ply = this.engine.ply;
    const now = this.now();
    const record = this.engine.tryMove(input);
    if (!record) return false;

    let clockMs: number | null = null;
    if (this.clocks && this.timeControl) {
      const me = this.myColor;
      if (ply >= 1) {
        const left = Math.max(0, this.clocks[me] - (now - this.turnStartedAt));
        this.clocks[me] = Math.round(left) + this.timeControl.incrementMs;
      }
      clockMs = this.clocks[me];
      this.turnStartedAt = now;
    }
    // Melangkah berarti menolak tawaran remis lawan; tawaran kita sendiri tetap berlaku.
    if (this.drawOffer === 'them') this.drawOffer = null;
    this.send('move', {
      game: this.game,
      ply,
      from: input.from,
      to: input.to,
      ...(input.promotion && { promotion: input.promotion }),
      san: record.san,
      clockMs,
    });
    this.changed();
    return true;
  }

  resign() {
    if (!this.started || this.result()) return;
    this.finish({ winner: opposite(this.myColor), reason: 'resign' });
    this.send('resign', { game: this.game });
  }

  abort() {
    if (!this.canAbort) return;
    this.finish({ reason: 'aborted' });
    this.send('abort', { game: this.game });
  }

  offerDraw() {
    if (!this.started || this.result() || this.drawOffer === 'me') return;
    if (this.drawOffer === 'them') return this.acceptDraw();
    this.drawOffer = 'me';
    this.send('draw_offer', { game: this.game });
    this.changed();
  }

  acceptDraw() {
    if (this.drawOffer !== 'them' || this.result()) return;
    this.finish({ reason: 'agreement' });
    this.send('draw_accept', { game: this.game });
  }

  declineDraw() {
    if (this.drawOffer !== 'them') return;
    this.drawOffer = null;
    this.send('draw_decline', { game: this.game });
    this.changed();
  }

  offerRematch() {
    if (!this.result() || this.rematch === 'me' || this.rematch === 'starting') return;
    if (this.rematch === 'them') return this.acceptRematch();
    this.rematch = 'me';
    this.send('rematch_offer', { game: this.game });
    this.changed();
  }

  acceptRematch() {
    if (this.rematch !== 'them') return;
    this.send('rematch_accept', { game: this.game });
    this.beginRematch();
  }

  /**
   * Lawan terputus lebih dari ABANDON_MS: menang karena ditinggal, atau batal bila belum
   * ada dua langkah. Bila lawan kembali, pesan ini sampai lebih dulu daripada `sync`.
   */
  claimAbandon() {
    const at = this.abandonAt;
    if (at === null || this.now() < at) return;
    if (this.engine.ply < 2) {
      this.finish({ reason: 'aborted' });
      this.send('abort', { game: this.game });
    } else {
      this.finish({ winner: this.myColor, reason: 'abandoned' });
      this.send('abandon', { game: this.game });
    }
  }

  /** Dipanggil berkala: nyatakan waktu habis bila jam pihak yang melangkah mencapai 0. */
  tick() {
    this.flagIfExpired();
  }

  // --- Pesan dari lawan ----------------------------------------------------

  receive(msg: GameMessage) {
    switch (msg.t) {
      case 'sync':
        return this.applySync(msg.d);
      case 'sync_request':
        return this.sendSync();
    }
    if (msg.d.game !== this.game) return; // sisa permainan sebelumnya

    switch (msg.t) {
      case 'move':
        return this.applyMove(msg.d);
      case 'resign':
        return this.finish({ winner: this.myColor, reason: 'resign' });
      case 'abort':
        if (this.canAbort) this.finish({ reason: 'aborted' });
        return;
      case 'abandon':
        return this.finish({ winner: opposite(this.myColor), reason: 'abandoned' });
      case 'timeout':
        return this.applyTimeoutClaim(msg.d.color);
      case 'draw_offer':
        if (this.result()) return;
        // Kedua pemain menawarkan bersamaan: anggap sepakat.
        if (this.drawOffer === 'me') return this.finish({ reason: 'agreement' });
        this.drawOffer = 'them';
        this.changed();
        return;
      case 'draw_accept':
        if (this.drawOffer === 'me') this.finish({ reason: 'agreement' });
        return;
      case 'draw_decline':
        if (this.drawOffer === 'me') {
          this.drawOffer = null;
          this.notify('Lawan menolak tawaran remis.');
        }
        return;
      case 'rematch_offer':
        if (!this.result()) return;
        // Kedua pemain mengajak bersamaan: langsung mulai.
        if (this.rematch === 'me') return this.beginRematch();
        if (this.rematch === null) {
          this.rematch = 'them';
          this.changed();
        }
        return;
      case 'rematch_accept':
        if (this.rematch === 'me') this.beginRematch();
        return;
    }
  }

  private applyMove(d: Payload<'move'>) {
    if (d.ply < this.engine.ply) return; // sudah diterapkan (dikirim ulang)
    const them = opposite(this.myColor);
    if (this.result() || d.ply !== this.engine.ply || this.engine.turn !== them) {
      return this.desync();
    }
    const input: MoveInput = {
      from: d.from,
      to: d.to,
      ...(d.promotion && { promotion: d.promotion }),
    };
    if (!this.engine.tryMove(input)) return this.desync();

    if (this.clocks && this.timeControl) {
      // Lawan melaporkan jamnya sendiri, tetapi tidak boleh menambah waktu.
      const limit = this.clocks[them] + this.timeControl.incrementMs;
      if (d.clockMs !== null) this.clocks[them] = Math.min(d.clockMs, limit);
      this.turnStartedAt = this.now();
    }
    // Lawan melangkah = menolak tawaran remis kita.
    if (this.drawOffer === 'me') this.drawOffer = null;
    this.changed();
  }

  private applySync(d: Payload<'sync'>) {
    if (this.role === 'host' || !this.load(d)) return;
    this.changed();
  }

  private load(d: Payload<'sync'>): boolean {
    const engine = GameEngine.fromMoves(d.moves);
    if (!engine) return false;
    this.game = d.game;
    this.hostColor = d.hostColor;
    this.timeControl = d.timeControl;
    this.engine = engine;
    this.clocks = d.clocks && { ...d.clocks };
    this.turnStartedAt = this.now();
    this.endResult = d.result;
    this.drawOffer = null;
    this.rematch = null;
    return true;
  }

  private applyTimeoutClaim(color: Color) {
    if (this.result() || !this.clocks || this.engine.turn !== color) return;
    // Belum habis menurut jam kita: abaikan, jam kita sendiri akan menyusul.
    if (this.remaining(color, this.now()) > TIMEOUT_TOLERANCE_MS) return;
    this.clocks[color] = 0;
    this.finish(this.timeoutResult(color));
  }

  // --- Bantuan -------------------------------------------------------------

  private flagIfExpired(): boolean {
    if (!this.clockRunning || !this.clocks) return false;
    const turn = this.engine.turn;
    if (this.remaining(turn, this.now()) > 0) return false;
    this.clocks[turn] = 0;
    this.finish(this.timeoutResult(turn));
    this.send('timeout', { game: this.game, color: turn });
    return true;
  }

  private timeoutResult(loser: Color): GameResult {
    const winner = opposite(loser);
    return this.engine.hasMatingMaterial(winner)
      ? { winner, reason: 'timeout' }
      : { reason: 'timeout' };
  }

  private remaining(color: Color, now: number) {
    if (!this.clocks) return Infinity;
    const running = this.clockRunning && this.engine.turn === color;
    return running ? this.clocks[color] - (now - this.turnStartedAt) : this.clocks[color];
  }

  private currentClocks(): Record<Color, number> {
    const now = this.now();
    const clamp = (c: Color) => Math.max(0, Math.round(this.remaining(c, now)));
    return { w: clamp('w'), b: clamp('b') };
  }

  /** Posisi kedua sisi berbeda: host mengirim keadaannya, tamu memintanya. */
  private desync() {
    if (this.role === 'host') this.sendSync();
    else this.send('sync_request', {});
  }

  private beginRematch() {
    if (this.role === 'host') {
      this.startNew(opposite(this.hostColor), this.timeControl);
    } else {
      this.rematch = 'starting'; // menunggu `sync` permainan baru dari host
      this.changed();
    }
  }

  private finish(result: GameResult) {
    if (this.result()) return;
    this.endResult = result;
    this.drawOffer = null;
    this.changed();
  }

  private notify(text: string) {
    this.notice = { id: (this.notice?.id ?? 0) + 1, text };
    this.changed();
  }

  private changed() {
    this.onChange();
  }
}
