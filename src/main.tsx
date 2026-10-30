import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
// Gaya dasar dimuat lebih dulu agar CSS milik halaman/komponen bisa menimpanya.
import './styles/tokens.css';
import './styles/global.css';
import App from './App.tsx';

// Service worker (cangkang offline & bisa di-install) hanya dibuat untuk build produksi.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
