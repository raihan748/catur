import { useState } from 'react';
import { pgnFileName } from '../game/pgn.ts';
import { copyText, downloadText } from '../utils/share.ts';

type ExportMenuProps = {
  /** Dibuat saat diminta saja (PGN perlu memutar ulang semua langkah). */
  getPgn: () => string;
  /** FEN posisi yang sedang ditampilkan. */
  fen: string;
};

export default function ExportMenu({ getPgn, fen }: ExportMenuProps) {
  const [copied, setCopied] = useState<'pgn' | 'fen' | null>(null);

  const copy = async (what: 'pgn' | 'fen', text: string) => {
    if (!(await copyText(text))) return;
    setCopied(what);
    setTimeout(() => setCopied(null), 2_000);
  };

  return (
    <details className="export">
      <summary className="export__summary">Ekspor permainan</summary>
      <div className="export__actions">
        <button type="button" className="btn" onClick={() => void copy('pgn', getPgn())}>
          {copied === 'pgn' ? 'PGN tersalin ✓' : 'Salin PGN'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => downloadText(pgnFileName(), getPgn(), 'application/x-chess-pgn')}
        >
          Unduh PGN
        </button>
        <button type="button" className="btn" onClick={() => void copy('fen', fen)}>
          {copied === 'fen' ? 'FEN tersalin ✓' : 'Salin FEN posisi ini'}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? `${copied.toUpperCase()} tersalin` : ''}
      </p>
    </details>
  );
}
