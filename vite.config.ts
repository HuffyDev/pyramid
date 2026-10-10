import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  define: { 'process.env': {}, global: 'globalThis' },
  resolve: { alias: { buffer: 'buffer/' } },
  build: { outDir: '../dist/client', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5000', '/media': 'http://localhost:5000', '/socket.io': { target: 'http://localhost:5000', ws: true } },
  },
});
