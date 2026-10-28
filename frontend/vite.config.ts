import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development /api is proxied to the backend; in production nginx proxies it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
});
