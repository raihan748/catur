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
      notice: this.notice,
    };
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

  /** Host: kirim keadaan lengkap ke tamu (tersambung, diminta, atau permainan baru). */
  sendSync() {
    if (this.role !== 'host' || !this.started) return;
    // Tawaran yang sedang berjalan dibatalkan agar kedua sisi kembali sama.
    this.drawOffer = null;
    if (this.rematch !== 'starting') this.rematch = null;
    this.send('sync', {
      game: this.game,
      hostColor: this.hostColor,
      timeControl: this.timeControl,
      moves: this.engine.moveList(),
      clocks: this.clocks && this.currentClocks(),
      result: this.result() ?? null,
    });
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
    if (this.role === 'host') return;
    const engine = GameEngine.fromMoves(d.moves);
    if (!engine) return;
    this.game = d.game;
    this.hostColor = d.hostColor;
    this.timeControl = d.timeControl;
    this.engine = engine;
    this.clocks = d.clocks && { ...d.clocks };
    this.turnStartedAt = this.now();
    this.endResult = d.result;
    this.drawOffer = null;
    this.rematch = null;
    this.changed();
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
