// Dependency guard for the domain layer. The root flat config lints these files;
// this block is added to the ROOT eslint.config.mjs in Step 4. Kept here as the
// canonical source of the restricted-import rule for the domain package.
export const domainImportGuard = {
  files: ['packages/domain/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'electron', message: 'Domain layer must not depend on Electron.' },
          { name: 'react', message: 'Domain layer must not depend on React.' },
          { name: 'next', message: 'Domain layer must not depend on Next.' },
          { name: 'better-sqlite3', message: 'Domain layer must not depend on SQLite.' },
          {
            name: '@nemis-desktop/shared',
            message: 'Domain layer must not depend on the infra-facing shared package.',
          },
        ],
        patterns: [
          {
            group: [
              'better-sqlite3*',
              '**/database/**',
              '**/data/**',
              '**/ipc/**',
              '**/electron/**',
            ],
            message: 'Domain layer must not import infrastructure modules.',
          },
        ],
      },
    ],
  },
};
