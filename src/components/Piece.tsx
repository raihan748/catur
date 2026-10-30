import type { BoardPiece } from '../game/types.ts';

// Set bidak C.A.T.U.R — digambar khusus untuk proyek ini (viewBox 100×100).
const COLORS = {
  w: { fill: '#f7f5ef', stroke: '#1b1d21', detail: '#1b1d21' },
  b: { fill: '#2a2c31', stroke: '#0f1012', detail: '#e9e6de' },
} as const;

const Base = () => <rect x="24" y="79" width="52" height="10" rx="3" />;

const SHAPES = {
  p: (detail: string) => (
    <>
      <path d="M41 51 Q43 66 32 80 L68 80 Q57 66 59 51 Z" />
      <path d="M36 47 Q50 41 64 47 L64 50 Q50 56 36 50 Z" />
      <circle cx="50" cy="31" r="11" />
      <Base />
      <path d="M44 27 Q47 23 51 23" fill="none" stroke={detail} strokeWidth="2" opacity="0.35" />
    </>
  ),
  r: (detail: string) => (
    <>
      <path d="M30 80 L34 70 L66 70 L70 80 Z" />
      <path d="M36 70 L38 38 L62 38 L64 70 Z" />
      <path d="M30 18 H38 V25 H46 V18 H54 V25 H62 V18 H70 V32 L64 38 H36 L30 32 Z" />
      <Base />
      <path d="M38 44 H62 M37 64 H63" fill="none" stroke={detail} strokeWidth="2.5" />
    </>
  ),
  n: (detail: string) => (
    <>
      <path d="M68 80 L32 80 C32 68 38 60 48 52 C42 54 36 56 31 54 C26 52 24 47 27 43 L39 31 C41 26 44 22 48 20 L50 12 L55 20 C67 23 75 35 75 51 C75 63 71 72 68 80 Z" />
      <Base />
      <circle cx="45" cy="31" r="2.8" fill={detail} stroke="none" />
      <circle cx="30.5" cy="47" r="1.6" fill={detail} stroke="none" />
      <path d="M58 25 C66 31 70 42 69 58" fill="none" stroke={detail} strokeWidth="2.5" />
    </>
  ),
  b: (detail: string) => (
    <>
      <path d="M42 62 Q44 72 32 80 L68 80 Q56 72 58 62 Z" />
      <ellipse cx="50" cy="60" rx="15" ry="4.5" />
      <path d="M50 20 C64 30 66 46 58 56 L42 56 C34 46 36 30 50 20 Z" />
      <circle cx="50" cy="15" r="5" />
      <Base />
      <path d="M55 32 L46 45" fill="none" stroke={detail} strokeWidth="3" />
    </>
  ),
  q: () => (
    <>
      <path d="M38 66 Q40 74 30 80 L70 80 Q60 74 62 66 Z" />
      <path d="M24 30 L34 60 L66 60 L76 30 L64 46 L63 22 L56 42 L50 18 L44 42 L37 22 L36 46 Z" />
      <rect x="34" y="58" width="32" height="8" rx="2" />
      <circle cx="24" cy="29" r="4.5" />
      <circle cx="37" cy="21" r="4.5" />
      <circle cx="50" cy="16" r="4.5" />
      <circle cx="63" cy="21" r="4.5" />
      <circle cx="76" cy="29" r="4.5" />
      <Base />
    </>
  ),
  k: (detail: string) => (
    <>
      <path d="M38 66 Q40 74 30 80 L70 80 Q60 74 62 66 Z" />
      <path d="M34 58 C24 44 34 30 50 38 C66 30 76 44 66 58 Z" />
      <rect x="34" y="56" width="32" height="10" rx="2" />
      <path d="M47 9 H53 V17 H60 V23 H53 V39 H47 V23 H40 V17 H47 Z" />
      <Base />
      <path d="M50 40 V56" fill="none" stroke={detail} strokeWidth="2.5" />
    </>
  ),
} as const;

type PieceProps = { piece: BoardPiece; className?: string };

export default function Piece({ piece, className }: PieceProps) {
  const c = COLORS[piece.color];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <g fill={c.fill} stroke={c.stroke} strokeWidth="3" strokeLinejoin="round">
        {SHAPES[piece.type](c.detail)}
      </g>
    </svg>
  );
}
