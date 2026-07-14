import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'electron'),
    },
  },
});
