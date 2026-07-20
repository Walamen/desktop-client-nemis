// Renderer boundary: React components talk ONLY to @nemis-desktop/presentation
// and @nemis-desktop/ui. Application/domain/electron/sqlite/data/ipc are banned;
// the presentation `./testing` composition helper, plus domain and application,
// are allowed only in the composition root (lib/presentation).

const RENDERER_RESTRICTED = {
  paths: [
    { name: '@nemis-desktop/application', message: 'Renderer must go through @nemis-desktop/presentation ViewModels.' },
    { name: '@nemis-desktop/domain', message: 'Renderer never imports domain entities.' },
    { name: 'better-sqlite3', message: 'Renderer must not touch SQLite.' },
    { name: 'better-sqlite3-multiple-ciphers', message: 'Renderer must not touch SQLite.' },
    { name: 'electron', message: 'Renderer must not import Electron; use the preload bridge.' },
    { name: '@nemis-desktop/presentation/testing', message: 'The fake application may only be composed in renderer/lib/presentation.' },
  ],
  patterns: [
    { group: ['**/electron/**', '**/data/**', '**/database/**', '**/ipc/**', 'electron', 'electron/*'], message: 'Renderer must not import main-process/infrastructure modules.' },
  ],
};

export const rendererImportGuard = {
  files: ['apps/desktop/renderer/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', RENDERER_RESTRICTED],
  },
};

// The composition root is the one place allowed to build the fake application.
// lib/presentation is the Phase-8 composition seam that wires every layer
// (domain reconstitute + the application layer's ApplicationLayer type) over
// the fake application into React; it is replaced by the IPC facade in the
// sync phase, so domain/application/testing imports are permitted only here.
// electron, native SQLite, and main-process/infra path patterns stay banned.
const COMPOSITION_ALLOWED_PATH_NAMES = new Set([
  '@nemis-desktop/presentation/testing',
  '@nemis-desktop/domain',
  '@nemis-desktop/application',
]);

export const rendererCompositionRelaxation = {
  files: ['apps/desktop/renderer/lib/presentation/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: RENDERER_RESTRICTED.paths.filter((p) => !COMPOSITION_ALLOWED_PATH_NAMES.has(p.name)),
        patterns: RENDERER_RESTRICTED.patterns,
      },
    ],
  },
};

// no-restricted-imports cannot catch a global member access like
// `window.nemis`, so components could bypass the bridge boundary entirely by
// reaching for the preload global directly. This rule bans that syntax
// pattern outright; only renderer/services bridge modules (relaxed below) may
// touch window.nemis.
export const rendererGlobalGuard = {
  files: ['apps/desktop/renderer/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "MemberExpression[object.name='window'][property.name='nemis']",
        message: 'Renderer components must not access window.nemis directly; use a renderer/services bridge module.',
      },
    ],
  },
};

// services/ is the bridge boundary itself, so it is the one place allowed to
// touch window.nemis directly. This must be registered after
// rendererGlobalGuard so its 'off' wins for these files.
export const rendererServicesRelaxation = {
  files: ['apps/desktop/renderer/services/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': 'off',
  },
};
