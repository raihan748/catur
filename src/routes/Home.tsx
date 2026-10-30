import { Link } from 'react-router';

// Placeholder Fase 0 — pilihan Jadi Host / Gabung Ruangan dibuat di Fase 2.
export default function Home() {
  return (
    <main className="page">
      <h1>♞ C.A.T.U.R</h1>
      <p>Main catur langsung dengan temanmu. Tanpa akun.</p>
      <p>
        <Link to="/tentang">Cara kerja</Link>
      </p>
    </main>
  );
}
