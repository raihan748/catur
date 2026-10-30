import type { ReactNode } from 'react';
import { opposite } from '../game/engine.ts';
import type { Color, PieceSymbol } from '../game/types.ts';
import CapturedPieces from './CapturedPieces.tsx';

type PlayerBarProps = {
  name: string;
  color: Color;
  captured: PieceSymbol[];
  advantage: number;
  active: boolean;
  /** Slot kanan, mis. jam catur (Fase 3). */
  children?: ReactNode;
};

export default function PlayerBar({
  name,
  color,
  captured,
  advantage,
  active,
  children,
}: PlayerBarProps) {
  return (
    <div className={active ? 'player player--active' : 'player'}>
      <span className={`player__dot player__dot--${color}`} aria-hidden="true" />
      <span className="player__name">{name}</span>
      <CapturedPieces pieces={captured} color={opposite(color)} advantage={advantage} />
      <span className="player__end">
        {active && <span className="player__turn">Giliran</span>}
        {children}
      </span>
    </div>
  );
}
