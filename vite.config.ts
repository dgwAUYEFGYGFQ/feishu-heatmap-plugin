import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3102,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    allowedHosts: ['strongly-binding-helmet-matter.trycloudflare.com'],
  },
});
