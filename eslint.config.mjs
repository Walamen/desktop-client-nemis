import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import { domainImportGuard } from './packages/domain/eslint.config.mjs';
import {
  applicationImportGuard,
  applicationLintRules,
} from './packages/application/eslint.config.mjs';
import {
  presentationImportGuard,
  presentationTestImportRelaxation,
  presentationLintRules,
} from './packages/presentation/eslint.config.mjs';
import {
  rendererImportGuard,
  rendererCompositionRelaxation,
} from './apps/desktop/renderer/eslint.config.mjs';
import { uiLintRules } from './packages/ui/eslint.config.mjs';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.vite/**',
      '**/.next/**',
      '**/out/**',
      '**/dist/**',
      '**/next-env.d.ts',
      '.superpowers/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/desktop/renderer/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  domainImportGuard,
  applicationImportGuard,
  applicationLintRules,
  presentationImportGuard,
  presentationTestImportRelaxation,
  presentationLintRules,
  uiLintRules,
  rendererImportGuard,
  rendererCompositionRelaxation,
  prettier,
);
