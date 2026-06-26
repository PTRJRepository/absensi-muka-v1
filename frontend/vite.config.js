// NOTE: Using .js extension because Vite 6.x has issues parsing proxy config from .ts files
// See: https://github.com/vitejs/vite/issues/15776
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3004,
    // Proxy /api and /auth routes to backend
    proxy: {
      '/api': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
