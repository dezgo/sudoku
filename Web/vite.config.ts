import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Built straight into the Worker's static-assets folder so `wrangler deploy`
// in ../Backend ships the app at sudokucrew.com/play/ with no copy step.
export default defineConfig({
  base: '/play/',
  plugins: [preact()],
  build: {
    outDir: '../Backend/public/play',
    emptyOutDir: true,
  },
  server: {
    // Local dev talks to the live API; same-origin in production.
    proxy: { '/v1': { target: 'https://sudokucrew.com', changeOrigin: true } },
  },
});
