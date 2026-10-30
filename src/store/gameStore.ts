import { create } from 'zustand';
import { GameEngine } from '../game/engine.ts';
import type { GameSnapshot, LegalTarget, MoveInput, MoveRecord, Square } from '../game/types.ts';

type GameStore = {
  snapshot: GameSnapshot;
  legalTargets: (from: Square) => LegalTarget[];
  move: (input: MoveInput) => MoveRecord | null;
  reset: (fen?: string) => void;
};

// Instance engine disimpan di luar state; yang masuk state hanya snapshot data murni.
export const useGameStore = create<GameStore>((set) => {
  let engine = new GameEngine();

  return {
    snapshot: engine.snapshot(),
    legalTargets: (from) => engine.legalTargets(from),
    move: (input) => {
      const record = engine.tryMove(input);
      if (record) set({ snapshot: engine.snapshot() });
      return record;
    },
    reset: (fen) => {
      engine = new GameEngine(fen);
      set({ snapshot: engine.snapshot() });
    },
  };
});
