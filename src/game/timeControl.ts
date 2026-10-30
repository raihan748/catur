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

/** Mis. "10 menit per pemain" atau "3 menit + 2 detik per langkah". */
export function timeControlDescription(tc: TimeControl | null): string {
  if (!tc) return 'Tanpa batas waktu';
  const base = `${tc.initialMs / 60_000} menit`;
  return tc.incrementMs
    ? `${base} + ${tc.incrementMs / 1_000} detik per langkah`
    : `${base} per pemain`;
}
