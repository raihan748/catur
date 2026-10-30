import { useEffect, useState } from 'react';
import Board from '../components/board/Board.tsx';
import Header from '../components/Header.tsx';
import MoveList from '../components/MoveList.tsx';
import PlayerBar from '../components/PlayerBar.tsx';
import '../components/game.css';
import { opposite } from '../game/engine.ts';
import { colorTitle, moveText, resultText, turnText } from '../game/labels.ts';
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

  useEffect(() => reset(), [reset]);

  const { result, turn } = snapshot;
  const orientation: Color = autoFlip ? turn : flipped ? 'b' : 'w';
  const advantage = (color: Color) => snapshot.material[color] - snapshot.material[opposite(color)];
  const status = result ? resultText(result) : turnText(turn, !!snapshot.checkSquare);
  const lastMove = snapshot.moves.at(-1);

  const restart = () => {
    if (result || snapshot.moves.length === 0 || window.confirm('Mulai ulang permainan ini?')) {
      reset();
    }
  };

  const bar = (color: Color) => (
    <PlayerBar
      name={colorTitle(color)}
      color={color}
      captured={snapshot.captured[color]}
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
            pieces={snapshot.pieces}
            orientation={orientation}
            movable={result ? null : turn}
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
            {result ? `. ${status}` : ''}
          </p>
          <MoveList moves={snapshot.moves} />
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
        </aside>
      </main>
    </div>
  );
}
