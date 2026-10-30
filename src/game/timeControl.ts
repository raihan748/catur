export type TimeControl = { initialMs: number; incrementMs: number };

export type TimeControlOption = { id: string; label: string; value: TimeControl | null };

const minutes = (m: number) => m * 60_000;
const seconds = (s: number) => s * 1_000;

export const TIME_CONTROLS: TimeControlOption[] = [
  { id: 'none', label: 'Tanpa jam', value: null },
  { id: '3+2', label: '3+2', value: { initialMs: minutes(3), incrementMs: seconds(2) } },
  { id: '5+0', label: '5+0', value: { initialMs: minutes(5), incrementMs: 0 } },
  { id: '10+0', label: '10+0', value: { initialMs: minutes(10), incrementMs: 0 } },
  { id: '15+10', label: '15+10', value: { initialMs: minutes(15), incrementMs: seconds(10) } },
];

export const DEFAULT_TIME_CONTROL_ID = '10+0';

export const findTimeControl = (id: string) => TIME_CONTROLS.find((o) => o.id === id);

const pad = (n: number) => String(n).padStart(2, '0');

/** Tampilan jam: "5:00", "1:02:03", dan persepuluhan detik di bawah 10 detik ("0:09.3"). */
export function formatClock(ms: number): string {
  if (ms <= 0) return '0:00.0';
  if (ms < 10_000) return `0:${(Math.floor(ms / 100) / 10).toFixed(1).padStart(4, '0')}`;
  const total = Math.ceil(ms / 1_000);
  const h = Math.floor(total / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Mis. "10 menit per pemain" atau "3 menit + 2 detik per langkah". */
export function timeControlDescription(tc: TimeControl | null): string {
  if (!tc) return 'Tanpa batas waktu';
  const base = `${tc.initialMs / 60_000} menit`;
  return tc.incrementMs
    ? `${base} + ${tc.incrementMs / 1_000} detik per langkah`
    : `${base} per pemain`;
}
