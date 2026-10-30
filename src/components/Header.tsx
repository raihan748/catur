import { Link } from 'react-router';
import { useSettings } from '../store/settingsStore.ts';
import { playSound } from '../utils/sound.ts';

export default function Header() {
  const muted = useSettings((s) => s.muted);
  const toggleMuted = useSettings((s) => s.toggleMuted);

  const toggle = () => {
    toggleMuted();
    if (muted) playSound('move'); // contoh bunyi saat suara dihidupkan
  };

  return (
    <header className="topbar">
      <Link to="/" className="topbar__brand">
        ♞ C.A.T.U.R
      </Link>
      <button
        type="button"
        className="topbar__btn"
        aria-pressed={!muted}
        title={muted ? 'Hidupkan suara' : 'Matikan suara'}
        onClick={toggle}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {muted ? (
            <path d="M17 9l5 6M22 9l-5 6" />
          ) : (
            <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
          )}
        </svg>
        <span className="sr-only">Suara</span>
      </button>
    </header>
  );
}
