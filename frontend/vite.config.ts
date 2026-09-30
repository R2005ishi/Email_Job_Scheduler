import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin API calls in dev -> the httpOnly session cookie just works.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: false },
      '/admin': { target: 'http://localhost:4000', changeOrigin: false },
    },
  },
});
