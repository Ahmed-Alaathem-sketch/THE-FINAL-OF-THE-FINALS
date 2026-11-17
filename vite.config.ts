import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static SPA for Cloudflare Pages. No server code, no environment secrets.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
