import { create } from 'zustand';
import { opposite } from '../game/engine.ts';
import { findTimeControl, type TimeControl } from '../game/timeControl.ts';
import type { Color } from '../game/types.ts';
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
  myColor: Color | null;
  timeControl: TimeControl | null;
  opponentName: string | null;
  enter: (params: EnterParams) => void;
  /** Mulai ulang sesi (tombol "Coba lagi" / "Sambung ulang"). */
  retry: () => void;
  leave: () => void;
  /** Keluar di tick berikutnya; dibatalkan bila halaman langsung masuk lagi (StrictMode). */
  leaveSoon: () => void;
};

const CODE_TAKEN_RETRIES = 3;
const CODE_TAKEN_RETRY_MS = 2_000;

const INITIAL = {
  code: null,
  role: null,
  status: 'idle',
  error: null,
  myName: '',
  myColor: null,
  timeControl: null,
  opponentName: null,
} satisfies Partial<RoomState>;

export const useRoomStore = create<RoomState>((set, get) => {
  let session: Session | null = null;
  let current: EnterParams | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const teardown = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    session?.close();
    session = null;
  };

  const start = (params: EnterParams, attempt = 0) => {
    const role: Role = params.host ? 'host' : 'guest';
    const s: Session = new Session(
      new PeerJsTransport(),
      role,
      { name: get().myName, clientId: getClientId() },
      {
        onStatus: (status) => session === s && set({ status }),
        onPeer: ({ name }) => session === s && set({ opponentName: name }),
        onStart: ({ hostColor, timeControl }) =>
          session === s && set({ myColor: opposite(hostColor), timeControl }),
        onError: (error) => {
          if (session !== s) return;
          if (error === 'code-taken' && params.host && attempt < CODE_TAKEN_RETRIES) {
            // Kode masih tercatat di server (mis. host baru memuat ulang halaman):
            // tunggu server melepasnya lalu daftar lagi, tanpa menampilkan galat.
            session = null;
            retryTimer = setTimeout(() => start(params, attempt + 1), CODE_TAKEN_RETRY_MS);
            return;
          }
          set({ error });
        },
      },
    );
    session = s;

    if (params.host) {
      const timeControl = findTimeControl(params.host.timeControlId)?.value ?? null;
      void s.host(params.code, { hostColor: params.host.color, timeControl });
    } else {
      void s.join(params.code);
    }
  };

  const begin = (params: EnterParams) => {
    teardown();
    current = params;
    const host = params.host;
    set({
      ...INITIAL,
      code: params.code,
      role: host ? 'host' : 'guest',
      myName: loadName(),
      myColor: host?.color ?? null,
      timeControl: host ? (findTimeControl(host.timeControlId)?.value ?? null) : null,
    });
    start(params);
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
      if (current) begin(current);
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
  };
});
