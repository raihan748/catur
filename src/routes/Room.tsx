import { Link, useParams } from 'react-router';

// Placeholder Fase 0 — papan dan koneksi P2P dibuat di Fase 1–3.
export default function Room() {
  const { id } = useParams();

  return (
    <main className="page">
      <h1>Ruangan {id?.toUpperCase()}</h1>
      <p>Halaman permainan sedang dibangun.</p>
      <p>
        <Link to="/">Kembali ke beranda</Link>
      </p>
    </main>
  );
}
