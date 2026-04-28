import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/tea/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5175,
    proxy: {
      '/tea/api': {
        target: 'http://localhost:3004',
        rewrite: (p) => p.replace(/^\/tea/, ''),
      },
    },
  },
});
