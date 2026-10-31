import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** File dari public/ yang ikut disimpan untuk offline. */
const PUBLIC_PRECACHE = [
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
];

/**
 * Buat sw.js saat build dari scripts/service-worker.js: daftar semua file hasil build
 * untuk disimpan offline, dengan versi dari isi file sehingga setiap deploy yang
 * mengubah aplikasi memasang service worker baru.
 */
function serviceWorker(): Plugin {
  return {
    name: 'catur-service-worker',
    apply: 'build',
    enforce: 'post', // setelah index.html dibuat
    generateBundle(_, bundle) {
      const template = readFileSync(
        new URL('./scripts/service-worker.js', import.meta.url),
        'utf8',
      );
      const hash = createHash('sha256').update(template);
      const files = new Set(PUBLIC_PRECACHE);
      for (const [fileName, item] of Object.entries(bundle)) {
        if (fileName.endsWith('.map')) continue;
        files.add(`/${fileName}`);
        hash.update(fileName).update(item.type === 'chunk' ? item.code : item.source);
      }
      const source = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify([...files]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

type VercelConfig = { headers: { source: string; headers: { key: string; value: string }[] }[] };

/**
 * Header keamanan (termasuk CSP) dari vercel.json, juga dipakai `vite preview` agar
 * build produksi bisa diuji lokal dengan aturan yang sama persis seperti di Vercel.
 */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(
    readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
  ) as VercelConfig;
  const all = config.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
  return Object.fromEntries(all.map((h) => [h.key, h.value]));
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  preview: { headers: productionHeaders() },
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
