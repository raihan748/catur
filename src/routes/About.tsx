import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';

export default function About() {
  const { hash } = useLocation();

  // Tautan seperti /tentang#koneksi langsung menuju bagiannya.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <main className="page">
      <h1>Cara kerja</h1>
      <p>
        C.A.T.U.R menghubungkan dua browser secara langsung (peer-to-peer). Langkah catur tidak
        melewati server kami, dan tidak ada akun maupun data pribadi yang disimpan.
      </p>
      <p>
        Untuk saling menemukan, kedua browser sebentar memakai server penghubung publik PeerJS dan
        server STUN Google. Keduanya melihat alamat IP-mu, tetapi tidak melihat isi permainan.
      </p>

      <h2 id="koneksi">Bantuan koneksi</h2>
      <p>
        Kadang dua perangkat tidak bisa tersambung langsung, terutama di sebagian jaringan seluler,
        Wi-Fi kantor atau kampus, dan jaringan dengan VPN. C.A.T.U.R tidak memakai server perantara
        (relay), jadi coba langkah berikut:
      </p>
      <ul>
        <li>Ganti jaringan salah satu pemain: Wi-Fi ↔ data seluler, atau pakai hotspot dari HP.</li>
        <li>Matikan VPN atau proxy untuk sementara.</li>
        <li>Pakai Chrome, Firefox, Safari, atau Edge versi terbaru.</li>
        <li>Pastikan host tetap membuka halaman ruangan sampai lawan masuk.</li>
        <li>Muat ulang halaman, lalu coba lagi.</li>
      </ul>

      <h2 id="terputus">Kalau koneksi terputus</h2>
      <ul>
        <li>
          Permainan tersimpan di browser, jadi aman dimuat ulang. Tab yang tertutup bisa dilanjutkan
          dari beranda.
        </li>
        <li>Tamu menyambung ulang sendiri; host cukup tetap membuka halaman ruangan.</li>
        <li>Jam kedua pemain dijeda selama terputus.</li>
        <li>
          Bila lawan tidak kembali dalam 60 detik, kamu boleh mengklaim kemenangan (atau membatalkan
          permainan bila belum ada dua langkah), atau terus menunggu.
        </li>
      </ul>

      <p>
        <Link to="/">Kembali ke beranda</Link>
      </p>
    </main>
  );
}
