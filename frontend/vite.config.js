import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// seedrandom (bundled inside TensorFlow.js) finds the global object with
// `(0, eval)("this")`, which our Content-Security-Policy correctly blocks.
// Rewrite that one expression to `globalThis` so we never need 'unsafe-eval'.
const noEvalGlobal = {
  name: 'bodywise-no-eval-global',
  transform(code, id) {
    if (!id.includes('node_modules')) return null;
    const out = code.replace(/\(\s*0\s*,\s*eval\s*\)\s*\(\s*(['"])this\1\s*\)/g, 'globalThis');
    return out === code ? null : { code: out, map: null };
  },
};

// Dev: `npm run dev` on :5173 proxies /api to FastAPI on :5000.
// Prod: `npm run build` writes dist/, which FastAPI serves.
export default defineConfig({
  plugins: [react(), noEvalGlobal],
  envDir: '..',   // one .env at the repo root; only VITE_* values reach the browser
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:5000' } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1600 },
});
