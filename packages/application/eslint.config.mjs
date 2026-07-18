// Dependency guard for the application layer. The root flat config imports and
// registers this block. The application layer may import @nemis-desktop/domain
// and @nemis-desktop/types, but never UI/Electron/SQLite/IPC modules.
export const applicationImportGuard = {
  files: ['packages/application/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'electron', message: 'Application layer must not depend on Electron.' },
          { name: 'react', message: 'Application layer must not depend on React.' },
          { name: 'react-dom', message: 'Application layer must not depend on React DOM.' },
          { name: 'next', message: 'Application layer must not depend on Next.' },
          { name: 'better-sqlite3', message: 'Application layer must not depend on SQLite.' },
          {
            name: 'better-sqlite3-multiple-ciphers',
            message: 'Application layer must not depend on SQLite.',
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
              'react',
              'react/*',
              'react-dom',
              'react-dom/*',
              'next',
              'next/*',
              'electron',
              'electron/*',
            ],
            message: 'Application layer must not import infrastructure or UI modules.',
          },
        ],
      },
    ],
  },
};

// Allow intentionally-unused, underscore-prefixed identifiers (no-op interface
// method params, stub args) in the application layer.
export const applicationLintRules = {
  files: ['packages/application/**/*.ts'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
  },
};
