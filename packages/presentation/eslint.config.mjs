// Dependency guard for the presentation layer. The root flat config imports and
// registers these blocks. Presentation may import @nemis-desktop/application,
// @nemis-desktop/types and zustand — never React/Electron/SQLite/IPC modules,
// and never @nemis-desktop/domain (it speaks application DTOs only).

const RESTRICTED_PATHS = [
  { name: 'electron', message: 'Presentation layer must not depend on Electron.' },
  { name: 'react', message: 'Presentation layer must not depend on React; bind in the renderer.' },
  { name: 'react-dom', message: 'Presentation layer must not depend on React DOM.' },
  { name: 'next', message: 'Presentation layer must not depend on Next.' },
  { name: 'better-sqlite3', message: 'Presentation layer must not depend on SQLite.' },
  {
    name: 'better-sqlite3-multiple-ciphers',
    message: 'Presentation layer must not depend on SQLite.',
  },
];

const RESTRICTED_PATTERNS = [
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
    message: 'Presentation layer must not import infrastructure or UI modules.',
  },
];

export const presentationImportGuard = {
  files: ['packages/presentation/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          ...RESTRICTED_PATHS,
          {
            name: '@nemis-desktop/domain',
            message: 'Presentation speaks application DTOs, never domain entities.',
          },
        ],
        patterns: RESTRICTED_PATTERNS,
      },
    ],
  },
};

// Tests may seed application-layer in-memory fakes with domain entities
// (mirroring how application's own tests seed them); everything else stays
// forbidden.
export const presentationTestImportRelaxation = {
  files: ['packages/presentation/src/**/*.test.ts', 'packages/presentation/src/testing/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', { paths: RESTRICTED_PATHS, patterns: RESTRICTED_PATTERNS }],
  },
};

export const presentationLintRules = {
  files: ['packages/presentation/**/*.ts'],
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
