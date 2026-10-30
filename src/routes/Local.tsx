import { useEffect, useState } from 'react';
import Board from '../components/board/Board.tsx';
import ExportMenu from '../components/ExportMenu.tsx';
import Header from '../components/Header.tsx';
import HistoryNav from '../components/HistoryNav.tsx';
import MoveList from '../components/MoveList.tsx';
import PlayerBar from '../components/PlayerBar.tsx';
import { useGameSounds } from '../components/useGameSounds.ts';
import { useHistoryView } from '../components/useHistoryView.ts';
import '../components/game.css';
import { opposite } from '../game/engine.ts';
import { colorTitle, moveText, resultText, turnText } from '../game/labels.ts';
import { buildPgn } from '../game/pgn.ts';
import type { Color } from '../game/types.ts';
import { useGameStore } from '../store/gameStore.ts';

/** Main berdua di satu perangkat (hot-seat). */
export default function Local() {
  const snapshot = useGameStore((s) => s.snapshot);
  const legalTargets = useGameStore((s) => s.legalTargets);
  const move = useGameStore((s) => s.move);
  const reset = useGameStore((s) => s.reset);

  const [flipped, setFlipped] = useState(false);
  const [autoFlip, setAutoFlip] = useState(false);
  /** Naik tiap mulai ulang: riwayat yang sedang dilihat kembali ke posisi terkini. */
  const [round, setRound] = useState(0);

  useEffect(() => reset(), [reset]);

  const history = useHistoryView(snapshot, round);
  const shown = history.view;
  useGameSounds(snapshot.moves, snapshot.result, round);

  const { result, turn } = snapshot;
  const orientation: Color = autoFlip ? turn : flipped ? 'b' : 'w';
  const advantage = (color: Color) => shown.material[color] - shown.material[opposite(color)];
  const status = result ? resultText(result) : turnText(turn, !!snapshot.checkSquare);
  const lastMove = snapshot.moves.at(-1);

  const restart = () => {
    if (result || snapshot.moves.length === 0 || window.confirm('Mulai ulang permainan ini?')) {
      reset();
      setRound((r) => r + 1);
    }
  };

  const getPgn = () =>
    buildPgn({ moves: snapshot.moves, white: colorTitle('w'), black: colorTitle('b'), result });

  const bar = (color: Color) => (
    <PlayerBar
      name={colorTitle(color)}
      color={color}
      captured={shown.captured[color]}
      advantage={advantage(color)}
      active={!result && turn === color}
    />
  );

  return (
    <div className="app">
      <Header />
      <main className="game">
        <section className="game__board" aria-label="Permainan lokal">
          {bar(opposite(orientation))}
          <Board
            pieces={shown.pieces}
            orientation={orientation}
            movable={result || !history.live ? null : turn}
            lastMove={shown.lastMove}
            checkSquare={shown.checkSquare}
            getTargets={legalTargets}
            onMove={move}
          />
          {bar(orientation)}
        </section>

        <aside className="game__side">
          <p className={result ? 'game__status game__status--over' : 'game__status'}>{status}</p>
          <p className="sr-only" aria-live="polite">
            {lastMove ? moveText(lastMove) : ''}
            {result ? `. ${status}` : ''}
          </p>
          <MoveList moves={snapshot.moves} current={history.ply} onSelect={history.show} />
          <HistoryNav ply={history.ply} total={history.total} onShow={history.show} />
          <div className="game__actions">
            <button
              type="button"
              className="btn"
              onClick={() => setFlipped((f) => !f)}
              disabled={autoFlip}
            >
              Putar papan
            </button>
            <button type="button" className={result ? 'btn btn--primary' : 'btn'} onClick={restart}>
              {result ? 'Main lagi' : 'Mulai ulang'}
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoFlip}
                onChange={(e) => setAutoFlip(e.target.checked)}
              />
              Putar otomatis tiap giliran
            </label>
          </div>
          <ExportMenu getPgn={getPgn} fen={shown.fen} />
        </aside>
      </main>
    </div>
  );
}
