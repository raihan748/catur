import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import Board from '../components/board/Board.tsx';
import Header from '../components/Header.tsx';
import PlayerBar from '../components/PlayerBar.tsx';
import '../components/game.css';
import '../components/room.css';
import { GameEngine, opposite } from '../game/engine.ts';
import { COLOR_NAMES, colorTitle } from '../game/labels.ts';
import { timeControlDescription, type TimeControl } from '../game/timeControl.ts';
import type { Color, LegalTarget } from '../game/types.ts';
import type { SessionErrorCode } from '../net/session.ts';
import { parseHostRouteState, useRoomStore } from '../store/roomStore.ts';
import { formatRoomCode, isValidRoomCode, normalizeRoomCode } from '../utils/roomCode.ts';

const ERRORS: Record<SessionErrorCode, { title: string; body: string; retry: boolean }> = {
  'not-found': {
    title: 'Ruangan tidak ditemukan',
    body: 'Ruangan dengan kode ini tidak ditemukan. Periksa kembali kodenya.',
    retry: true,
  },
  full: { title: 'Ruangan penuh', body: 'Ruangan ini sudah penuh.', retry: false },
  unreachable: {
    title: 'Tidak bisa terhubung',
    body: 'Tidak bisa terhubung langsung. Coba ganti jaringan (Wi-Fi ↔ seluler).',
    retry: true,
  },
  network: {
    title: 'Server penghubung tidak terjangkau',
    body: 'Periksa koneksi internetmu, lalu coba lagi.',
    retry: true,
  },
  unsupported: {
    title: 'Browser tidak didukung',
    body: 'Browser ini tidak mendukung koneksi langsung (WebRTC). Coba Chrome, Firefox, atau Safari terbaru.',
    retry: false,
  },
  'code-taken': {
    title: 'Kode sedang dipakai',
    body: 'Kode ruangan ini sedang dipakai. Buat ruangan baru dari beranda.',
    retry: false,
  },
  version: {
    title: 'Versi aplikasi berbeda',
    body: 'Versi aplikasimu berbeda dengan lawan. Muat ulang halaman ini.',
    retry: false,
  },
};

export default function Room() {
  const { id = '' } = useParams();
  const code = normalizeRoomCode(id);
  const valid = isValidRoomCode(code);
  const location = useLocation();
  const host = useMemo(() => parseHostRouteState(location.state), [location.state]);

  const enter = useRoomStore((s) => s.enter);
  const leaveSoon = useRoomStore((s) => s.leaveSoon);
  const retry = useRoomStore((s) => s.retry);
  const storeCode = useRoomStore((s) => s.code);
  const role = useRoomStore((s) => s.role);
  const status = useRoomStore((s) => s.status);
  const error = useRoomStore((s) => s.error);
  const myName = useRoomStore((s) => s.myName);
  const myColor = useRoomStore((s) => s.myColor);
  const timeControl = useRoomStore((s) => s.timeControl);
  const opponentName = useRoomStore((s) => s.opponentName);

  useEffect(() => {
    if (!valid) return;
    enter({ code, host });
    return leaveSoon;
  }, [valid, code, host, enter, leaveSoon]);

  if (!valid) {
    return (
      <Notice title="Kode ruangan tidak valid">
        <p>Periksa kembali tautan atau kode yang kamu terima.</p>
        <HomeLink />
      </Notice>
    );
  }

  if (storeCode !== code || status === 'idle') {
    return <Notice title="Menyiapkan ruangan…" busy />;
  }

  if (status === 'error' && error) {
    const e = ERRORS[error];
    return (
      <Notice title={e.title}>
        <p>{e.body}</p>
        <div className="form-actions form-actions--start">
          {e.retry && (
            <button type="button" className="btn btn--primary" onClick={retry}>
              Coba lagi
            </button>
          )}
          <HomeLink />
        </div>
      </Notice>
    );
  }

  if (status === 'creating') return <Notice title="Membuat ruangan…" busy />;

  if (status === 'connecting') {
    return <Notice title={`Menghubungkan ke ruangan ${formatRoomCode(code)}…`} busy />;
  }

  if (status === 'connected' && myColor) {
    return (
      <ConnectedView
        myName={myName}
        myColor={myColor}
        opponentName={opponentName}
        timeControl={timeControl}
      />
    );
  }

  if (role === 'guest') {
    return (
      <Notice title="Koneksi terputus">
        <p>Sambungan ke lawan terputus.</p>
        <div className="form-actions form-actions--start">
          <button type="button" className="btn btn--primary" onClick={retry}>
            Sambung ulang
          </button>
          <HomeLink />
        </div>
      </Notice>
    );
  }

  // Host: menunggu tamu pertama, atau tamu yang terputus tersambung kembali.
  return (
    <WaitingCard
      code={code}
      myColor={myColor}
      timeControl={timeControl}
      opponentLeft={status === 'disconnected'}
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <Header />
      <main className="room">{children}</main>
    </div>
  );
}

function Notice({
  title,
  busy,
  children,
}: {
  title: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <Shell>
      <section className="card" aria-live="polite">
        <h1 className="card__title room__title">
          {busy && <span className="spinner" aria-hidden="true" />}
          {title}
        </h1>
        {children}
      </section>
    </Shell>
  );
}

const HomeLink = () => (
  <Link to="/" className="btn">
    Kembali ke beranda
  </Link>
);

type WaitingCardProps = {
  code: string;
  myColor: Color | null;
  timeControl: TimeControl | null;
  opponentLeft: boolean;
};

function WaitingCard({ code, myColor, timeControl, opponentLeft }: WaitingCardProps) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const link = `${window.location.origin}/r/${code}`;
  const canShare = typeof navigator.share === 'function';

  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : link);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Izin clipboard ditolak: kode tetap terlihat untuk disalin manual.
    }
  };

  const share = () => {
    navigator
      .share({ title: 'C.A.T.U.R', text: `Ayo main catur! Kode ruangan: ${code}`, url: link })
      .catch(() => {});
  };

  return (
    <Shell>
      <section className="card waiting">
        <h1 className="card__title">{opponentLeft ? 'Lawan terputus' : 'Ruangan siap'}</h1>
        <p className="waiting__lead">
          {opponentLeft
            ? 'Menunggu lawan tersambung kembali dengan kode yang sama.'
            : 'Bagikan kode ini ke lawanmu. Permainan dimulai begitu ia masuk.'}
        </p>

        <p className="room-code">
          <span className="sr-only">Kode ruangan: {code.split('').join(' ')}</span>
          <span aria-hidden="true">{formatRoomCode(code)}</span>
        </p>

        <div className="form-actions form-actions--center">
          <button type="button" className="btn btn--primary" onClick={() => copy('code')}>
            {copied === 'code' ? 'Kode tersalin ✓' : 'Salin kode'}
          </button>
          <button type="button" className="btn" onClick={() => copy('link')}>
            {copied === 'link' ? 'Tautan tersalin ✓' : 'Salin tautan'}
          </button>
          {canShare && (
            <button type="button" className="btn" onClick={share}>
              Bagikan
            </button>
          )}
        </div>

        <p className="waiting__status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          Menunggu lawan…
        </p>

        <dl className="room-meta">
          <div>
            <dt>Warnamu</dt>
            <dd>{myColor ? colorTitle(myColor) : '—'}</dd>
          </div>
          <div>
            <dt>Waktu</dt>
            <dd>{timeControlDescription(timeControl)}</dd>
          </div>
        </dl>

        <Link to="/" className="btn btn--ghost">
          Batalkan ruangan
        </Link>
      </section>
    </Shell>
  );
}

const noTargets = (): LegalTarget[] => [];
const noop = () => {};

type ConnectedViewProps = {
  myName: string;
  myColor: Color;
  opponentName: string | null;
  timeControl: TimeControl | null;
};

/** Fase 2: papan posisi awal, belum bisa digerakkan. Langkah online dibuat di Fase 3. */
function ConnectedView({ myName, myColor, opponentName, timeControl }: ConnectedViewProps) {
  const snapshot = useMemo(() => new GameEngine().snapshot(), []);
  const theirColor = opposite(myColor);
  const theirName = opponentName || colorTitle(theirColor);

  return (
    <div className="app">
      <Header />
      <main className="game">
        <section className="game__board" aria-label="Permainan online">
          <PlayerBar
            name={theirName}
            color={theirColor}
            captured={[]}
            advantage={0}
            active={false}
          />
          <Board
            pieces={snapshot.pieces}
            orientation={myColor}
            movable={null}
            getTargets={noTargets}
            onMove={noop}
          />
          <PlayerBar
            name={myName ? `${myName} (kamu)` : 'Kamu'}
            color={myColor}
            captured={[]}
            advantage={0}
            active={false}
          />
        </section>
        <aside className="game__side">
          <p className="game__status" aria-live="polite">
            Terhubung dengan {theirName}
          </p>
          <p className="muted">
            Kamu bermain sebagai {COLOR_NAMES[myColor]} · {timeControlDescription(timeControl)}
          </p>
          <p className="muted">Langkah online segera hadir.</p>
        </aside>
      </main>
    </div>
  );
}
