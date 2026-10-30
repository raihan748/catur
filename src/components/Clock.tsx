import { useEffect, useState } from 'react';
import { COLOR_NAMES } from '../game/labels.ts';
import { formatClock } from '../game/timeControl.ts';
import type { Color } from '../game/types.ts';

type ClockProps = {
  color: Color;
  /** Sisa waktu saat giliran sekarang dimulai. */
  baseMs: number;
  running: boolean;
  /** performance.now() saat giliran sekarang dimulai. */
  since: number;
};

const LOW_TIME_MS = 10_000;
const REFRESH_MS = 100;

export default function Clock({ color, baseMs, running, since }: ClockProps) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(performance.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, [running]);

  // `now` bisa sedikit tertinggal tepat setelah jam mulai berjalan; jangan sampai melebihi baseMs.
  const ms = running ? Math.max(0, Math.min(baseMs, baseMs - (now - since))) : baseMs;
  const className = ['clock', running && 'clock--active', ms < LOW_TIME_MS && 'clock--low']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={className} role="timer" aria-label={`Sisa waktu ${COLOR_NAMES[color]}`}>
      {formatClock(ms)}
    </span>
  );
}
