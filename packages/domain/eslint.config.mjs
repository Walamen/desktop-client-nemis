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
            message:
              'Domain layer must not depend on the infra-facing shared package (only @nemis-desktop/shared/nemis-id is allowed).',
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
              // The bare package root is banned by the `paths` entry above. It must
              // not also be listed here: a bare entry ignores everything beneath it
              // under gitignore semantics, and the `!` exception below could not
              // re-include the allowed subpath.
              '@nemis-desktop/shared/*',
              // Single exception: the NEMIS ID algorithm. It is pure and
              // dependency-free, and is the byte-identical twin of the server's
              // Nemis/packages/utils/src/nemis-id.ts (shared golden fixtures),
              // so the NemisId value object reuses it instead of duplicating it.
              '!@nemis-desktop/shared/nemis-id',
              // Gitignore semantics: re-including a path re-includes everything
              // under it, so re-ban deeper paths to keep the exception exact.
              '@nemis-desktop/shared/nemis-id/*',
            ],
            message: 'Domain layer must not import infrastructure modules.',
          },
        ],
      },
    ],
  },
};
