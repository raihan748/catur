import { Link } from 'react-router';

export default function About() {
  return (
    <main className="page">
      <h1>Cara kerja</h1>
      <p>
        C.A.T.U.R menghubungkan dua browser secara langsung (peer-to-peer). Langkah catur tidak
        melewati server kami, dan tidak ada akun maupun data pribadi yang disimpan.
      </p>
      <p>
        <Link to="/">Kembali ke beranda</Link>
      </p>
    </main>
  );
}
