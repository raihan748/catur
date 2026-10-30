import { SQUARES, type Square } from 'chess.js';
import { z } from 'zod';
import { MAX_CHAT_LENGTH } from './chat.ts';
import { MAX_NAME_LENGTH } from './identity.ts';

export { MAX_NAME_LENGTH };

// Protokol pesan antar-peer (PRD §8). Semua pesan dari lawan dianggap tidak tepercaya
// dan selalu divalidasi skema sebelum diproses.

export const PROTOCOL_VERSION = 1;

/** Batas panjang permainan yang diterima lewat `sync` (ply). */
const MAX_PLIES = 1_000;
const MAX_CLOCK_MS = 6 * 60 * 60_000;

const color = z.enum(['w', 'b']);
const square = z.enum(SQUARES as [Square, ...Square[]]);
const promotion = z.enum(['q', 'r', 'b', 'n']);
const gameNo = z.number().int().positive();
const clockMs = z.number().int().min(0).max(MAX_CLOCK_MS);

const timeControl = z
  .object({
    initialMs: z
      .number()
      .int()
      .min(0)
      .max(3 * 60 * 60_000),
    incrementMs: z
      .number()
      .int()
      .min(0)
      .max(10 * 60_000),
  })
  .nullable();

const moveInput = z.object({ from: square, to: square, promotion: promotion.optional() });

const result = z.object({
  winner: color.optional(),
  reason: z.enum([
    'checkmate',
    'resign',
    'timeout',
    'stalemate',
    'insufficient',
    'repetition',
    '50move',
    'agreement',
    'abandoned',
    'aborted',
  ]),
});

const gameOnly = z.object({ game: gameNo });

const sync = z.object({
  game: gameNo,
  hostColor: color,
  timeControl,
  moves: z.array(moveInput).max(MAX_PLIES),
  clocks: z.object({ w: clockMs, b: clockMs }).nullable(),
  result: result.nullable(),
});

const payloads = {
  // Kendali sambungan
  hello: z.object({
    name: z.string().max(MAX_NAME_LENGTH),
    clientId: z.string().min(1).max(64),
    sessionId: z.string().min(1).max(64),
    protocol: z.number().int(),
  }),
  reject: z.object({ reason: z.enum(['full', 'version']) }),
  ack: z.object({ n: z.number().int().positive() }),
  ping: z.object({}),
  pong: z.object({}),

  // Permainan. `sync` membawa keadaan lengkap dari host (permainan baru, rematch,
  // sambung ulang, atau pemulihan saat posisi kedua sisi berbeda).
  sync,
  sync_request: z.object({}),
  move: moveInput.extend({
    game: gameNo,
    /** Jumlah langkah sebelum langkah ini; mendeteksi posisi yang tidak sinkron. */
    ply: z.number().int().min(0).max(MAX_PLIES),
    san: z.string().max(10),
    /** Sisa jam pengirim setelah langkah (sudah termasuk increment); null = tanpa jam. */
    clockMs: clockMs.nullable(),
  }),
  resign: gameOnly,
  abort: gameOnly,
  /** Pengirim menang karena lawan terputus terlalu lama. */
  abandon: gameOnly,
  timeout: gameOnly.extend({ color }),
  draw_offer: gameOnly,
  draw_accept: gameOnly,
  draw_decline: gameOnly,
  rematch_offer: gameOnly,
  rematch_accept: gameOnly,

  // Obrolan; tidak terikat nomor permainan.
  chat: z.object({ text: z.string().min(1).max(MAX_CHAT_LENGTH) }),
};

const envelope = <T extends keyof typeof payloads>(t: T) =>
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    t: z.literal(t),
    n: z.number().int().nonnegative(),
    ts: z.number(),
    d: payloads[t],
  });

export const messageSchema = z.discriminatedUnion('t', [
  envelope('hello'),
  envelope('reject'),
  envelope('ack'),
  envelope('ping'),
  envelope('pong'),
  envelope('sync'),
  envelope('sync_request'),
  envelope('move'),
  envelope('resign'),
  envelope('abort'),
  envelope('abandon'),
  envelope('timeout'),
  envelope('draw_offer'),
  envelope('draw_accept'),
  envelope('draw_decline'),
  envelope('rematch_offer'),
  envelope('rematch_accept'),
  envelope('chat'),
]);

export type Message = z.infer<typeof messageSchema>;
export type MessageType = Message['t'];
export type Payload<T extends MessageType> = Extract<Message, { t: T }>['d'];

/** Pesan kendali tidak bernomor (n = 0): tidak di-ack dan tidak dicek duplikat. */
export const CONTROL_TYPES = ['hello', 'reject', 'ack', 'ping', 'pong'] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];
export type SequencedType = Exclude<MessageType, ControlType>;
/** Pesan bernomor yang diteruskan Session ke aplikasi. */
export type PeerMessage = Extract<Message, { t: SequencedType }>;
/** Pesan untuk OnlineGame (semua pesan bernomor kecuali obrolan). */
export type GameMessage = Exclude<PeerMessage, { t: 'chat' }>;

export function parseMessage(raw: unknown): Message | null {
  const parsed = messageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Validasi keadaan permainan tersimpan (bentuknya sama dengan isi `sync`). */
export function parseGameState(raw: unknown): Payload<'sync'> | null {
  const parsed = sync.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function createMessage<T extends MessageType>(t: T, n: number, d: Payload<T>): Message {
  return { v: PROTOCOL_VERSION, t, n, ts: Date.now(), d } as Message;
}
