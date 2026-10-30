import { create } from 'zustand';
import { OnlineGame, type OnlineGameView } from '../game/onlineGame.ts';
import { findTimeControl } from '../game/timeControl.ts';
import type { Color, LegalTarget, MoveInput, Square } from '../game/types.ts';
import { loadName } from '../net/identity.ts';
import { PeerJsTransport } from '../net/peerjs.ts';
import { parseGameState } from '../net/protocol.ts';
import {
  Session,
  type ConnectionStatus,
  type Role,
  type SessionErrorCode,
} from '../net/session.ts';
import { claimRoom, loadRoom, removeRoom, saveRoom, type RoomClaim } from './savedRooms.ts';

/** State router yang dibawa beranda → /r/:kode saat pengguna memilih Jadi Host. */
export type HostRouteState = { role: 'host'; color: Color; timeControlId: string };

/** State router dari tombol "Lanjutkan" di beranda. */
export type ResumeRouteState = { resume: Role };

export type RoomEntry = { host: HostRouteState | null; resume: Role | null };

type RouteState = (Partial<HostRouteState> & Partial<ResumeRouteState>) | null;

function parseHost(s: RouteState): HostRouteState | null {
  if (s?.role !== 'host' || (s.color !== 'w' && s.color !== 'b')) return null;
  if (typeof s.timeControlId !== 'string' || !findTimeControl(s.timeControlId)) return null;
  return { role: 'host', color: s.color, timeControlId: s.timeControlId };
}

export function parseRouteState(state: unknown): RoomEntry {
  const s = state as RouteState;
  const resume = s?.resume === 'host' || s?.resume === 'guest' ? s.resume : null;
  return { host: parseHost(s), resume };
}

type EnterParams = RoomEntry & { code: string };

type RoomState = {
  code: string | null;
  role: Role | null;
  status: ConnectionStatus;
  error: SessionErrorCode | null;
  /** Alasan percobaan sambung ulang terakhir gagal (untuk pesan diagnosis). */
  retryReason: SessionErrorCode | null;
  /** Nama yang dikirim ke lawan saat sesi dimulai. */
  myName: string;
  /** null = belum pernah ada lawan di ruangan ini. */
  opponentName: string | null;
  /** Keadaan permainan untuk UI; null sebelum masuk ruangan. */
  game: OnlineGameView | null;

  enter: (params: EnterParams) => void;
  /** Tombol "Coba lagi" (setelah galat) atau "Coba sekarang" (saat menyambung ulang). */
  retry: () => void;
  leave: () => void;
  /** Keluar di tick berikutnya; dibatalkan bila halaman langsung masuk lagi (StrictMode). */
  leaveSoon: () => void;
  /** Simpan keadaan sekarang (tab disembunyikan atau ditutup). */
  persist: () => void;
  /** Tab terlihat lagi atau jaringan kembali: periksa sambungan sekarang. */
  wake: () => void;

  // Aksi permainan (fungsi stabil, aman dipakai sebagai prop).
  legalTargets: (from: Square) => LegalTarget[];
  move: (input: MoveInput) => void;
  resign: () => void;
  abort: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  offerRematch: () => void;
  acceptRematch: () => void;
  claimAbandon: () => void;
};

const CODE_TAKEN_RETRIES = 5;
const CODE_TAKEN_RETRY_MS = 2_000;
const CLOCK_TICK_MS = 250;

const INITIAL = {
  code: null,
  role: null,
  status: 'idle',
  error: null,
  retryReason: null,
  myName: '',
  opponentName: null,
  game: null,
} satisfies Partial<RoomState>;

export const useRoomStore = create<RoomState>((set, get) => {
  let session: Session | null = null;
  let game: OnlineGame | null = null;
  let current: EnterParams | null = null;
  /** Peran dan simpanan milik tab ini untuk ruangan `current`. */
  let claim: RoomClaim | null = null;
  /** Naik setiap masuk/keluar ruangan; klaim yang selesai terlambat diabaikan. */
  let entry = 0;
  let clientId = '';
  let guestClientId: string | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

  const teardown = () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (ticker) clearInterval(ticker);
    retryTimer = null;
    ticker = null;
    session?.close();
    session = null;
    game = null;
  };

  const persist = () => {
    if (!claim?.persist || !current) return;
    saveRoom({
      code: current.code,
      role: claim.role,
      clientId,
      myName: get().myName,
      guestClientId,
      opponentName: get().opponentName,
      game: game?.state() ?? null,
      savedAt: Date.now(),
    });
  };

  /** Ada lawan dan permainan belum selesai: simpanan dipertahankan saat keluar ruangan. */
  const unfinished = () => {
    const state = game?.state();
    return !!state && !state.result && get().opponentName !== null;
  };

  /** Buat Session baru; OnlineGame tetap dipakai sehingga permainan tidak hilang. */
  const connect = (code: string, role: Role, resume: boolean, attempt = 0) => {
    const g = game;
    if (!g) return;
    const s: Session = new Session(
      new PeerJsTransport(),
      role,
      { name: get().myName, clientId },
      {
        onStatus: (status) => {
          if (session !== s) return;
          set(status === 'connected' ? { status, retryReason: null } : { status });
          g.setConnected(status === 'connected');
        },
        onMessage: (msg) => session === s && g.receive(msg),
        onPeer: (peer) => {
          if (session !== s) return;
          if (role === 'host') guestClientId = peer.clientId;
          set({ opponentName: peer.name });
          persist();
        },
        onRetry: (reason) => session === s && set({ retryReason: reason }),
        onError: (error) => {
          if (session !== s) return;
          if (error === 'code-taken' && role === 'host' && attempt < CODE_TAKEN_RETRIES) {
            // Kode masih tercatat di server (mis. host baru memuat ulang halaman):
            // tunggu server melepasnya lalu daftar lagi, tanpa menampilkan galat.
            session = null;
            retryTimer = setTimeout(
              () => connect(code, role, resume, attempt + 1),
              CODE_TAKEN_RETRY_MS,
            );
            return;
          }
          set({ error });
        },
      },
      { resume, guestClientId },
    );
    session = s;
    if (role === 'host') void s.host(code);
    else void s.join(code);
  };

  const begin = (params: EnterParams, c: RoomClaim) => {
    teardown();
    const saved = c.saved;
    clientId = saved?.clientId ?? crypto.randomUUID();
    guestClientId = saved?.guestClientId ?? null;
    set({
      ...INITIAL,
      code: params.code,
      role: c.role,
      myName: saved?.myName ?? loadName(),
      opponentName: saved?.opponentName ?? null,
    });

    const g: OnlineGame = new OnlineGame({
      role: c.role,
      send: (t, d) => session?.send(t, d),
      onChange: () => {
        if (game !== g) return;
        set({ game: g.view() });
        persist();
      },
    });
    game = g;
    const restored = parseGameState(saved?.game);
    if (restored) {
      g.restore(restored);
    } else if (c.role === 'host') {
      // Ruangan baru (atau simpanan rusak: mulai lagi dengan pengaturan bawaan).
      const tc = findTimeControl(params.host?.timeControlId ?? '')?.value ?? null;
      g.startNew(params.host?.color ?? 'w', tc);
    }
    set({ game: g.view() });
    persist();
    ticker = setInterval(() => game?.tick(), CLOCK_TICK_MS);
    connect(params.code, c.role, !!restored);
  };

  const leave = () => {
    if (claim?.persist && current) {
      if (unfinished()) persist();
      else removeRoom(current.code, claim.role);
    }
    teardown();
    claim?.release();
    claim = null;
    current = null;
    entry += 1;
    set(INITIAL);
  };

  return {
    ...INITIAL,

    enter: (params) => {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      const same =
        current?.code === params.code &&
        !!current.host === !!params.host &&
        current.resume === params.resume;
      if (same) return;

      if (current) leave();
      const id = ++entry;
      current = params;
      set({ ...INITIAL, code: params.code });
      void claimRoom(params.code, params.host ? 'host' : params.resume).then((c) => {
        if (id !== entry || !current) return c.release();
        claim = c;
        begin(current, c);
      });
    },

    retry: () => {
      if (!current || !claim) return;
      if (get().status !== 'error') return session?.wake();
      // Sesi berhenti karena galat: mulai lagi dari simpanan terbaru.
      const saved = claim.persist ? loadRoom(current.code, claim.role) : null;
      claim = { ...claim, saved };
      begin(current, claim);
    },

    leave,

    leaveSoon: () => {
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        leaveTimer = null;
        get().leave();
      }, 0);
    },

    persist,
    wake: () => session?.wake(),

    legalTargets: (from) => game?.legalTargets(from) ?? [],
    move: (input) => void game?.move(input),
    resign: () => game?.resign(),
    abort: () => game?.abort(),
    offerDraw: () => game?.offerDraw(),
    acceptDraw: () => game?.acceptDraw(),
    declineDraw: () => game?.declineDraw(),
    offerRematch: () => game?.offerRematch(),
    acceptRematch: () => game?.acceptRematch(),
    claimAbandon: () => game?.claimAbandon(),
  };
});
