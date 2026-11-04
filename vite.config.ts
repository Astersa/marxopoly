import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  publicDir: '../../public',
  build: { outDir: '../../dist/client', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5173, proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true }, '/healthz': 'http://localhost:3000' } },
});
