import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { opposite } from '../../game/engine.ts';
import { colorTitle, moveText, resultText } from '../../game/labels.ts';
import type { OnlineGameView, RematchState } from '../../game/onlineGame.ts';
import type { Color, GameResult } from '../../game/types.ts';
import type { ConnectionStatus, Role } from '../../net/session.ts';
import { useRoomStore } from '../../store/roomStore.ts';
import { formatRoomCode } from '../../utils/roomCode.ts';
import Board from '../board/Board.tsx';
import Clock from '../Clock.tsx';
import Header from '../Header.tsx';
import MoveList from '../MoveList.tsx';
import PlayerBar from '../PlayerBar.tsx';
import '../game.css';
import './online.css';

type OnlineGameScreenProps = {
  view: OnlineGameView;
  role: Role;
  code: string;
  myName: string;
  opponentName: string | null;
  connection: ConnectionStatus;
};

export default function OnlineGameScreen({
  view,
  role,
  code,
  myName,
  opponentName,
  connection,
}: OnlineGameScreenProps) {
  const legalTargets = useRoomStore((s) => s.legalTargets);
  const move = useRoomStore((s) => s.move);
  const acceptDraw = useRoomStore((s) => s.acceptDraw);
  const declineDraw = useRoomStore((s) => s.declineDraw);
  const retry = useRoomStore((s) => s.retry);
  const [flipped, setFlipped] = useState(false);

  const { snapshot, result, myColor } = view;
  const theirColor = opposite(myColor);
  const theirName = opponentName || colorTitle(theirColor);
  const connected = connection === 'connected';
  const orientation = flipped ? theirColor : myColor;
  const lastMove = snapshot.moves.at(-1);
  const check = snapshot.checkSquare ? ' — skak!' : '';
  const status = result
    ? resultText(result)
    : snapshot.turn === myColor
      ? `Giliranmu${check}`
      : `Giliran ${theirName}${check}`;

  const bar = (color: Color) => (
    <PlayerBar
      name={color === myColor ? (myName ? `${myName} (kamu)` : 'Kamu') : theirName}
      color={color}
      captured={snapshot.captured[color]}
      advantage={snapshot.material[color] - snapshot.material[opposite(color)]}
      active={!result && snapshot.turn === color}
    >
      {view.clocks && (
        <Clock
          color={color}
          baseMs={view.clocks[color]}
          running={view.clockRunning && snapshot.turn === color}
          since={view.turnStartedAt}
        />
      )}
    </PlayerBar>
  );

  return (
    <div className="app">
      <Header />
      <main className="game">
        <section className="game__board" aria-label="Permainan online">
          {bar(opposite(orientation))}
          <Board
            pieces={snapshot.pieces}
            orientation={orientation}
            movable={view.canPlay ? myColor : null}
            lastMove={snapshot.lastMove}
            checkSquare={snapshot.checkSquare}
            getTargets={legalTargets}
            onMove={move}
          />
          {bar(orientation)}
        </section>

        <aside className="game__side">
          <p className={result ? 'game__status game__status--over' : 'game__status'}>{status}</p>
          <p className="sr-only" aria-live="polite">
            {lastMove ? moveText(lastMove) : ''}
            {result ? `. ${resultText(result)}` : ''}
          </p>

          {!connected && (
            <ConnectionBanner role={role} code={code} connection={connection} onRetry={retry} />
          )}

          {view.drawOffer === 'them' && !result && (
            <div className="banner" role="alert">
              <p>{theirName} menawarkan remis.</p>
              <div className="banner__actions">
                <button type="button" className="btn btn--primary" onClick={acceptDraw}>
                  Terima
                </button>
                <button type="button" className="btn" onClick={declineDraw}>
                  Tolak
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="banner banner--result">
              <p className="banner__title">{outcomeTitle(result, myColor)}</p>
              <RematchControls rematch={view.rematch} connected={connected} />
            </div>
          )}

          <MoveList moves={snapshot.moves} />

          <div className="game__actions">
            {!result && <GameActions view={view} connected={connected} />}
            <button type="button" className="btn" onClick={() => setFlipped((f) => !f)}>
              Putar papan
            </button>
          </div>
        </aside>
      </main>

      {result && (
        <ResultDialog
          key={view.game}
          title={outcomeTitle(result, myColor)}
          detail={resultText(result)}
        >
          <RematchControls rematch={view.rematch} connected={connected} />
        </ResultDialog>
      )}
      <Toast notice={view.notice} />
    </div>
  );
}

function outcomeTitle(result: GameResult, myColor: Color) {
  if (result.reason === 'aborted') return 'Permainan dibatalkan';
  if (!result.winner) return 'Remis';
  return result.winner === myColor ? 'Kamu menang!' : 'Kamu kalah';
}

function GameActions({ view, connected }: { view: OnlineGameView; connected: boolean }) {
  const resign = useRoomStore((s) => s.resign);
  const abort = useRoomStore((s) => s.abort);
  const offerDraw = useRoomStore((s) => s.offerDraw);
  const [confirming, setConfirming] = useState(false);

  if (view.canAbort) {
    return (
      <button type="button" className="btn" onClick={abort} disabled={!connected}>
        Batalkan permainan
      </button>
    );
  }

  if (confirming) {
    return (
      <div className="confirm" role="group" aria-label="Konfirmasi menyerah">
        <span>Yakin menyerah? Permainan akan dianggap kalah.</span>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            setConfirming(false);
            resign();
          }}
        >
          Ya, menyerah
        </button>
        <button type="button" className="btn" onClick={() => setConfirming(false)} autoFocus>
          Batal
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={offerDraw}
        disabled={!connected || view.drawOffer === 'me'}
      >
        {view.drawOffer === 'me' ? 'Tawaran remis terkirim' : '½ Tawar remis'}
      </button>
      <button type="button" className="btn" onClick={() => setConfirming(true)}>
        ⚑ Menyerah
      </button>
    </>
  );
}

function RematchControls({ rematch, connected }: { rematch: RematchState; connected: boolean }) {
  const offerRematch = useRoomStore((s) => s.offerRematch);
  const acceptRematch = useRoomStore((s) => s.acceptRematch);

  switch (rematch) {
    case 'me':
      return <p className="muted">Menunggu jawaban lawan…</p>;
    case 'starting':
      return <p className="muted">Memulai permainan baru…</p>;
    case 'them':
      return (
        <>
          <p>Lawan mengajak main lagi.</p>
          <button type="button" className="btn btn--primary" onClick={acceptRematch}>
            Terima, main lagi
          </button>
        </>
      );
    default:
      return (
        <button
          type="button"
          className="btn btn--primary"
          onClick={offerRematch}
          disabled={!connected}
        >
          Main lagi (tukar warna)
        </button>
      );
  }
}

type ConnectionBannerProps = {
  role: Role;
  code: string;
  connection: ConnectionStatus;
  onRetry: () => void;
};

function ConnectionBanner({ role, code, connection, onRetry }: ConnectionBannerProps) {
  if (role === 'host') {
    return (
      <div className="banner banner--warn" role="status">
        <p>
          Lawan terputus. Menunggu ia tersambung kembali dengan kode{' '}
          <strong>{formatRoomCode(code)}</strong>.
        </p>
        <p className="muted">Jam dijeda selama terputus.</p>
      </div>
    );
  }
  if (connection === 'connecting') {
    return (
      <div className="banner banner--warn" role="status">
        <p className="banner__row">
          <span className="spinner" aria-hidden="true" />
          Menyambung ulang…
        </p>
      </div>
    );
  }
  return (
    <div className="banner banner--warn" role="status">
      <p>Koneksi ke lawan terputus. Jam dijeda.</p>
      <div className="banner__actions">
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Sambung ulang
        </button>
      </div>
    </div>
  );
}

type ResultDialogProps = { title: string; detail: string; children: ReactNode };

/** Muncul sekali saat permainan selesai; bisa ditutup untuk melihat papan. */
function ResultDialog({ title, detail, children }: ResultDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={ref} className="result-dialog" aria-labelledby="result-title">
      <h2 id="result-title" className="result-dialog__title">
        {title}
      </h2>
      <p className="muted">{detail}</p>
      <div className="result-dialog__actions">
        {children}
        <button type="button" className="btn" onClick={() => ref.current?.close()}>
          Lihat papan
        </button>
        <Link to="/" className="btn btn--ghost">
          Ke beranda
        </Link>
      </div>
    </dialog>
  );
}

const TOAST_MS = 3_000;

function Toast({ notice }: { notice: OnlineGameView['notice'] }) {
  const [hiddenId, setHiddenId] = useState(0);
  const id = notice?.id ?? 0;

  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => setHiddenId(id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [id]);

  if (!notice || notice.id === hiddenId) return null;
  return (
    <div className="toast" role="status">
      {notice.text}
    </div>
  );
}
