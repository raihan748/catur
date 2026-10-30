import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import '../components/home.css';
import {
  DEFAULT_TIME_CONTROL_ID,
  findTimeControl,
  TIME_CONTROLS,
  timeControlDescription,
} from '../game/timeControl.ts';
import type { Color } from '../game/types.ts';
import { loadName, MAX_NAME_LENGTH, saveName } from '../net/identity.ts';
import type { HostRouteState, ResumeRouteState } from '../store/roomStore.ts';
import { listResumableRooms, removeRoom, type ResumableRoom } from '../store/savedRooms.ts';
import {
  formatRoomCode,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
} from '../utils/roomCode.ts';

type Mode = 'host' | 'gabung';

export default function Home() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode');
  const choose = (next: Mode | null) => setParams(next ? { mode: next } : {});

  return (
    <div className="app">
      <main className="home">
        <h1 className="home__brand">♞ C.A.T.U.R</h1>
        <p className="home__tagline">Main catur langsung dengan temanmu. Tanpa akun.</p>

        {mode === 'host' ? (
          <HostForm onBack={() => choose(null)} />
        ) : mode === 'gabung' ? (
          <JoinForm onBack={() => choose(null)} />
        ) : (
          <>
            <ResumeList />
            <div className="choices">
              <button type="button" className="choice" onClick={() => choose('host')}>
                <span className="choice__title">Jadi Host</span>
                <span className="choice__desc">Buat ruangan dan dapatkan kode untuk lawanmu.</span>
              </button>
              <button type="button" className="choice" onClick={() => choose('gabung')}>
                <span className="choice__title">Gabung Ruangan</span>
                <span className="choice__desc">Punya kode dari temanmu? Masukkan di sini.</span>
              </button>
            </div>
          </>
        )}

        <nav className="home__links" aria-label="Lainnya">
          <Link to="/lokal">Main berdua di satu perangkat</Link>
          <Link to="/tentang">Cara kerja</Link>
        </nav>
      </main>
    </div>
  );
}

/** Permainan yang tabnya tertutup di tengah jalan; bisa dilanjutkan selama lawan menunggu. */
function ResumeList() {
  const [rooms, setRooms] = useState(listResumableRooms);
  if (rooms.length === 0) return null;

  const dismiss = (room: ResumableRoom) => {
    removeRoom(room.code, room.role);
    setRooms(listResumableRooms());
  };

  return (
    <section className="card" aria-labelledby="resume-title">
      <h2 id="resume-title" className="card__title">
        Permainan belum selesai
      </h2>
      <ul className="resume">
        {rooms.map((room) => (
          <li key={`${room.code}:${room.role}`} className="resume__item">
            <span>
              <strong>{formatRoomCode(room.code)}</strong> · kamu{' '}
              {room.myColor === 'w' ? 'Putih' : 'Hitam'} melawan {room.opponentName || 'lawan'}
            </span>
            <span className="resume__actions">
              <Link
                to={`/r/${room.code}`}
                state={{ resume: room.role } satisfies ResumeRouteState}
                className="btn btn--primary"
              >
                Lanjutkan
              </Link>
              <button type="button" className="btn btn--ghost" onClick={() => dismiss(room)}>
                Abaikan
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="player-name">Nama panggilan (opsional)</label>
      <input
        id="player-name"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="nickname"
      />
    </div>
  );
}

const COLOR_CHOICES: { value: Color | 'random'; label: string }[] = [
  { value: 'w', label: 'Putih' },
  { value: 'b', label: 'Hitam' },
  { value: 'random', label: 'Acak' },
];

function HostForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(loadName);
  const [color, setColor] = useState<Color | 'random'>('random');
  const [timeControlId, setTimeControlId] = useState(DEFAULT_TIME_CONTROL_ID);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    saveName(name);
    const state: HostRouteState = {
      role: 'host',
      color: color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color,
      timeControlId,
    };
    navigate(`/r/${generateRoomCode()}`, { state });
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="card__title">Jadi Host</h2>
      <NameField value={name} onChange={setName} />

      <fieldset className="field">
        <legend>Warna bidakmu</legend>
        <div className="segmented">
          {COLOR_CHOICES.map((c) => (
            <label key={c.value} className="segmented__item">
              <input
                type="radio"
                name="color"
                value={c.value}
                checked={color === c.value}
                onChange={() => setColor(c.value)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Kontrol waktu</legend>
        <div className="segmented segmented--wrap">
          {TIME_CONTROLS.map((tc) => (
            <label key={tc.id} className="segmented__item">
              <input
                type="radio"
                name="time-control"
                value={tc.id}
                checked={timeControlId === tc.id}
                onChange={() => setTimeControlId(tc.id)}
              />
              <span>{tc.label}</span>
            </label>
          ))}
        </div>
        <p className="field__hint">
          {timeControlDescription(findTimeControl(timeControlId)?.value ?? null)}
        </p>
      </fieldset>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onBack}>
          Kembali
        </button>
        <button type="submit" className="btn btn--primary">
          Buat Ruangan
        </button>
      </div>
    </form>
  );
}

function JoinForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState(loadName);
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidRoomCode(code)) {
      setError(
        `Kode ruangan terdiri dari ${ROOM_CODE_LENGTH} huruf dan angka, tanpa O, I, 0, atau 1.`,
      );
      return;
    }
    saveName(name);
    navigate(`/r/${code}`);
  };

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2 className="card__title">Gabung Ruangan</h2>
      <div className="field">
        <label htmlFor="room-code">Kode ruangan</label>
        <input
          id="room-code"
          className="input input--code"
          value={code}
          onChange={(e) => {
            setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH));
            setError('');
          }}
          placeholder="K7M2QX"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          aria-invalid={!!error}
          aria-describedby={error ? 'room-code-error' : undefined}
        />
        {error && (
          <p id="room-code-error" className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <NameField value={name} onChange={setName} />

      <div className="form-actions">
        <button type="button" className="btn" onClick={onBack}>
          Kembali
        </button>
        <button type="submit" className="btn btn--primary">
          Gabung
        </button>
      </div>
    </form>
  );
}
