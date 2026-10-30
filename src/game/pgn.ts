import { Chess } from 'chess.js';
import type { TimeControl } from './timeControl.ts';
import type { EndReason, GameResult, MoveRecord } from './types.ts';

type PgnGame = {
  moves: readonly MoveRecord[];
  white: string;
  black: string;
  result?: GameResult;
  timeControl?: TimeControl | null;
  date?: Date;
};

// Nilai tag PGN memakai istilah baku (bahasa Inggris) agar terbaca aplikasi catur lain.
const TERMINATION: Partial<Record<EndReason, string>> = {
  timeout: 'time forfeit',
  abandoned: 'abandoned',
};

export function resultTag(result?: GameResult): string {
  if (!result || result.reason === 'aborted') return '*';
  if (!result.winner) return '1/2-1/2';
  return result.winner === 'w' ? '1-0' : '0-1';
}

const escapeTag = (value: string) => value.replace(/[\\"]/g, (c) => `\\${c}`);

const pad = (n: number) => String(n).padStart(2, '0');

export function buildPgn({ moves, white, black, result, timeControl, date = new Date() }: PgnGame) {
  const chess = new Chess();
  for (const m of moves) chess.move({ from: m.from, to: m.to, promotion: m.promotion });

  const tags: [string, string][] = [
    ['Event', 'C.A.T.U.R'],
    ['Site', typeof location === 'undefined' ? '?' : location.host],
    ['Date', `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`],
    ['White', white],
    ['Black', black],
    ['Result', resultTag(result)],
  ];
  if (timeControl) {
    tags.push(['TimeControl', `${timeControl.initialMs / 1000}+${timeControl.incrementMs / 1000}`]);
  }
  const termination = result && TERMINATION[result.reason];
  if (termination) tags.push(['Termination', termination]);

  for (const [key, value] of tags) chess.setHeader(key, escapeTag(value));
  return chess.pgn();
}

/** Nama file unduhan, mis. "catur-20261031-1405.pgn". */
export function pgnFileName(date = new Date()) {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `catur-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.pgn`;
}
