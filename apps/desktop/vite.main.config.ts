import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'electron'),
    },
  },
  build: {
    rollupOptions: {
      // Native module: must stay a runtime require, never bundled.
      external: ['better-sqlite3'],
    },
  },
});
