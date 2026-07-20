// Lint rules for the UI package. Several components (e.g. Card.tsx) are
// ported verbatim from the web design system, which intentionally renames
// unused destructured props with an underscore prefix. Ignore those here
// rather than editing the ported components.
export const uiLintRules = {
  files: ['packages/ui/**/*.{ts,tsx}'],
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
