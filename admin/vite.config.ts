import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/v1': 'http://127.0.0.1:4000',
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
