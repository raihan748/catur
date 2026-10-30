import { describe, expect, it } from 'vitest';
import { cleanChatText, MAX_CHAT_LENGTH } from './chat.ts';
import { createMessage, parseMessage } from './protocol.ts';

describe('obrolan', () => {
  it('merapikan spasi dan membuang karakter kendali', () => {
    expect(cleanChatText('  halo \n\t  dunia  ')).toBe('halo dunia');
    expect(cleanChatText('a\u0000b‮c')).toBe('a b c');
    expect(cleanChatText('   ')).toBe('');
  });

  it('memotong teks panjang tanpa merusak emoji', () => {
    expect(cleanChatText('x'.repeat(500))).toHaveLength(MAX_CHAT_LENGTH);
    const cut = cleanChatText('x'.repeat(MAX_CHAT_LENGTH - 1) + '😀');
    expect(cut).toBe('x'.repeat(MAX_CHAT_LENGTH - 1));
  });

  it('teks yang sudah dibersihkan selalu lolos skema protokol', () => {
    const text = cleanChatText('<b>halo</b> '.repeat(40));
    expect(parseMessage(createMessage('chat', 1, { text }))?.t).toBe('chat');
    expect(parseMessage({ v: 1, t: 'chat', n: 1, ts: 0, d: { text: '' } })).toBeNull();
    const tooLong = { v: 1, t: 'chat', n: 1, ts: 0, d: { text: 'x'.repeat(MAX_CHAT_LENGTH + 1) } };
    expect(parseMessage(tooLong)).toBeNull();
  });
});
