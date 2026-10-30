import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MAX_CHAT_LENGTH } from '../../net/chat.ts';
import { useRoomStore } from '../../store/roomStore.ts';

/** Di layar lebar panel obrolan langsung terbuka; di HP tertutup agar papan tetap lega. */
const WIDE_SCREEN = '(min-width: 960px)';

export default function ChatPanel({ opponentName }: { opponentName: string }) {
  const chat = useRoomStore((s) => s.chat);
  const unread = useRoomStore((s) => s.unreadChat);
  const sendChat = useRoomStore((s) => s.sendChat);
  const readChat = useRoomStore((s) => s.readChat);
  const [open, setOpen] = useState(() => window.matchMedia(WIDE_SCREEN).matches);
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLOListElement>(null);

  // Selama terbuka, pesan baru langsung terbaca dan log digulir ke pesan terakhir.
  useEffect(() => {
    if (!open) return;
    readChat();
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, chat, readChat]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    sendChat(draft);
    setDraft('');
  };

  return (
    <section className="chat" aria-label="Obrolan">
      <button
        type="button"
        className="chat__toggle"
        aria-expanded={open}
        aria-controls="chat-body"
        onClick={() => setOpen((o) => !o)}
      >
        Obrolan
        {unread > 0 && (
          <span className="badge">
            {unread}
            <span className="sr-only"> pesan belum dibaca</span>
          </span>
        )}
        <span className="chat__chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      <p className="sr-only" aria-live="polite">
        {!open && unread > 0 ? `${unread} pesan baru dari ${opponentName}` : ''}
      </p>

      {open && (
        <div id="chat-body" className="chat__body">
          {chat.length === 0 ? (
            <p className="chat__empty muted">Belum ada pesan.</p>
          ) : (
            <ol ref={logRef} className="chat__log" role="log" aria-label="Pesan">
              {chat.map((m, i) => (
                <li key={i} className={m.from === 'me' ? 'chat__msg chat__msg--me' : 'chat__msg'}>
                  <span className="sr-only">{m.from === 'me' ? 'Kamu' : opponentName}: </span>
                  {m.text}
                </li>
              ))}
            </ol>
          )}
          <form className="chat__form" onSubmit={submit}>
            <input
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_CHAT_LENGTH}
              placeholder="Tulis pesan…"
              aria-label="Tulis pesan"
              autoComplete="off"
              enterKeyHint="send"
            />
            <button type="submit" className="btn" disabled={!draft.trim()}>
              Kirim
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
