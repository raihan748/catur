import type { KeyboardEvent } from 'react';

type HistoryNavProps = {
  /** Posisi yang ditampilkan: jumlah langkah yang sudah dimainkan di posisi itu. */
  ply: number;
  total: number;
  onShow: (ply: number) => void;
};

const KEYS: Record<string, (ply: number, total: number) => number> = {
  ArrowLeft: (ply) => ply - 1,
  ArrowRight: (ply) => ply + 1,
  Home: () => 0,
  End: (_, total) => total,
};

/** Tombol ⟨⟨ ⟨ ⟩ ⟩⟩ untuk melihat posisi sebelumnya (hanya lihat). */
export default function HistoryNav({ ply, total, onShow }: HistoryNavProps) {
  if (total === 0) return null;
  const atStart = ply === 0;
  const live = ply >= total;

  // aria-disabled (bukan disabled) agar fokus keyboard tidak hilang di ujung riwayat.
  const step = (label: string, symbol: string, target: number, off: boolean) => (
    <button
      type="button"
      className="btn history__btn"
      aria-label={label}
      aria-disabled={off}
      onClick={() => !off && onShow(target)}
    >
      <span aria-hidden="true">{symbol}</span>
    </button>
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = KEYS[e.key];
    if (!next) return;
    e.preventDefault();
    onShow(Math.min(total, Math.max(0, next(ply, total))));
  };

  return (
    <div className="history" role="group" aria-label="Riwayat langkah" onKeyDown={onKeyDown}>
      {step('Ke posisi awal', '«', 0, atStart)}
      {step('Langkah sebelumnya', '‹', ply - 1, atStart)}
      <span className="history__pos" aria-live="polite">
        {live ? 'Posisi terkini' : `Langkah ${ply} dari ${total}`}
      </span>
      {step('Langkah berikutnya', '›', ply + 1, live)}
      {step('Ke posisi terkini', '»', total, live)}
    </div>
  );
}
