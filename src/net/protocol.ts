import { z } from 'zod';
import { MAX_NAME_LENGTH } from './identity.ts';

export { MAX_NAME_LENGTH };

// Protokol pesan antar-peer (PRD §8). Semua pesan dari lawan dianggap tidak tepercaya
// dan selalu divalidasi skema sebelum diproses.

export const PROTOCOL_VERSION = 1;

const color = z.enum(['w', 'b']);

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

const payloads = {
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
  start: z.object({ hostColor: color, timeControl, fen: z.string().max(100) }),
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
  envelope('start'),
]);

export type Message = z.infer<typeof messageSchema>;
export type MessageType = Message['t'];
export type Payload<T extends MessageType> = Extract<Message, { t: T }>['d'];

/** Pesan kendali tidak bernomor (n = 0): tidak di-ack dan tidak dicek duplikat. */
export const CONTROL_TYPES = ['hello', 'reject', 'ack', 'ping', 'pong'] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];
export type SequencedType = Exclude<MessageType, ControlType>;

export function parseMessage(raw: unknown): Message | null {
  const result = messageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function createMessage<T extends MessageType>(t: T, n: number, d: Payload<T>): Message {
  return { v: PROTOCOL_VERSION, t, n, ts: Date.now(), d } as Message;
}
