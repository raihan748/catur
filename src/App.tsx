import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import About from './routes/About.tsx';
import Home from './routes/Home.tsx';
import NotFound from './routes/NotFound.tsx';

// Halaman permainan (chess.js, PeerJS, Zod) dimuat saat dibuka agar beranda tetap ringan.
const Room = lazy(() => import('./routes/Room.tsx'));
const Local = lazy(() => import('./routes/Local.tsx'));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/r/:id" element={<Room />} />
        <Route path="/lokal" element={<Local />} />
        <Route path="/tentang" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
