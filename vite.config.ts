import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('./src/renderer'),
  base: './',
  plugins: [react()],
  build: { outDir: r('./out/renderer'), emptyOutDir: true },
  server: { port: 5173, strictPort: true },
});
