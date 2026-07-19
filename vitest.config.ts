import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/**/src/**/*.test.ts', 'apps/desktop/electron/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          include: ['apps/desktop/renderer/**/*.test.{ts,tsx}', 'packages/ui/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['apps/desktop/renderer/vitest.setup.ts'],
        },
      },
    ],
  },
});
