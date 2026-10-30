import { Route, Routes } from 'react-router';
import About from './routes/About.tsx';
import Home from './routes/Home.tsx';
import NotFound from './routes/NotFound.tsx';
import Room from './routes/Room.tsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/r/:id" element={<Room />} />
      <Route path="/tentang" element={<About />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
