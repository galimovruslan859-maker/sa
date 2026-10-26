import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND = process.env.VITE_BACKEND_URL ?? 'http://localhost:4000';
const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Запросы к API и загруженным фотографиям проксируются на backend,
 * поэтому фронтенд всегда работает по относительным URL — одинаково
 * в локальной разработке, в песочнице и на хостинге.
 */
const proxy = {
  '/api': { target: BACKEND, changeOrigin: true },
  '/uploads': { target: BACKEND, changeOrigin: true },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(rootDir, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 5173),
    strictPort: false,
    allowedHosts: true,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PREVIEW_PORT ?? 4173),
    allowedHosts: true,
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
