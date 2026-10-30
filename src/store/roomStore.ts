import { create } from 'zustand';
import { OnlineGame, type OnlineGameView } from '../game/onlineGame.ts';
import { findTimeControl } from '../game/timeControl.ts';
import type { Color, LegalTarget, MoveInput, Square } from '../game/types.ts';
import { getClientId, loadName } from '../net/identity.ts';
import { PeerJsTransport } from '../net/peerjs.ts';
import {
  Session,
  type ConnectionStatus,
  type Role,
  type SessionErrorCode,
} from '../net/session.ts';

/** State router yang dibawa beranda → /r/:kode saat pengguna memilih Jadi Host. */
export type HostRouteState = { role: 'host'; color: Color; timeControlId: string };

export function parseHostRouteState(state: unknown): HostRouteState | null {
  const s = state as Partial<HostRouteState> | null;
  if (s?.role !== 'host' || (s.color !== 'w' && s.color !== 'b')) return null;
  if (typeof s.timeControlId !== 'string' || !findTimeControl(s.timeControlId)) return null;
  return { role: 'host', color: s.color, timeControlId: s.timeControlId };
}

type EnterParams = { code: string; host: HostRouteState | null };

type RoomState = {
  code: string | null;
  role: Role | null;
  status: ConnectionStatus;
  error: SessionErrorCode | null;
  /** Nama yang dikirim ke lawan saat sesi dimulai. */
  myName: string;
  opponentName: string | null;
  /** Keadaan permainan untuk UI; null sebelum masuk ruangan. */
  game: OnlineGameView | null;

  enter: (params: EnterParams) => void;
  /** Mulai ulang sesi (tombol "Coba lagi" / "Sambung ulang"). */
  retry: () => void;
  leave: () => void;
  /** Keluar di tick berikutnya; dibatalkan bila halaman langsung masuk lagi (StrictMode). */
  leaveSoon: () => void;

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
};

const CODE_TAKEN_RETRIES = 3;
const CODE_TAKEN_RETRY_MS = 2_000;
const CLOCK_TICK_MS = 250;

const INITIAL = {
  code: null,
  role: null,
  status: 'idle',
  error: null,
  myName: '',
  opponentName: null,
  game: null,
} satisfies Partial<RoomState>;

export const useRoomStore = create<RoomState>((set, get) => {
  let session: Session | null = null;
  let game: OnlineGame | null = null;
  let current: EnterParams | null = null;
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

  /** Buat Session baru; OnlineGame tetap dipakai sehingga permainan tidak hilang. */
  const connect = (params: EnterParams, attempt = 0) => {
    const g = game;
    if (!g) return;
    const s: Session = new Session(
      new PeerJsTransport(),
      params.host ? 'host' : 'guest',
      { name: get().myName, clientId: getClientId() },
      {
        onStatus: (status) => {
          if (session !== s) return;
          set({ status });
          g.setConnected(status === 'connected');
        },
        onConnect: () => {
          // Host selalu mengirim keadaan lengkap; tamu menunggu `sync`.
          if (session === s && params.host) g.sendSync();
        },
        onMessage: (msg) => session === s && g.receive(msg),
        onPeer: ({ name }) => session === s && set({ opponentName: name }),
        onError: (error) => {
          if (session !== s) return;
          if (error === 'code-taken' && params.host && attempt < CODE_TAKEN_RETRIES) {
            // Kode masih tercatat di server (mis. host baru memuat ulang halaman):
            // tunggu server melepasnya lalu daftar lagi, tanpa menampilkan galat.
            session = null;
            retryTimer = setTimeout(() => connect(params, attempt + 1), CODE_TAKEN_RETRY_MS);
            return;
          }
          set({ error });
        },
      },
    );
    session = s;
    if (params.host) void s.host(params.code);
    else void s.join(params.code);
  };

  const begin = (params: EnterParams) => {
    teardown();
    current = params;
    const role: Role = params.host ? 'host' : 'guest';
    set({ ...INITIAL, code: params.code, role, myName: loadName() });

    const g: OnlineGame = new OnlineGame({
      role,
      send: (t, d) => session?.send(t, d),
      onChange: () => game === g && set({ game: g.view() }),
    });
    game = g;
    if (params.host) {
      g.startNew(params.host.color, findTimeControl(params.host.timeControlId)?.value ?? null);
    }
    set({ game: g.view() });
    ticker = setInterval(() => game?.tick(), CLOCK_TICK_MS);
    connect(params);
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
        (session || retryTimer);
      if (!same) begin(params);
    },

    retry: () => {
      if (!current) return;
      // Sambung ulang dengan permainan yang sama; bila belum ada permainan, mulai dari awal.
      if (game && get().status !== 'error') {
        session?.close();
        session = null;
        connect(current);
      } else {
        begin(current);
      }
    },

    leave: () => {
      teardown();
      current = null;
      set(INITIAL);
    },

    leaveSoon: () => {
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        leaveTimer = null;
        get().leave();
      }, 0);
    },

    legalTargets: (from) => game?.legalTargets(from) ?? [],
    move: (input) => void game?.move(input),
    resign: () => game?.resign(),
    abort: () => game?.abort(),
    offerDraw: () => game?.offerDraw(),
    acceptDraw: () => game?.acceptDraw(),
    declineDraw: () => game?.declineDraw(),
    offerRematch: () => game?.offerRematch(),
    acceptRematch: () => game?.acceptRematch(),
  };
});
