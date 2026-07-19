# Phase 6 — Presentation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@nemis-desktop/presentation` — the MVVM layer between the future React UI and `@nemis-desktop/application`, with vanilla Zustand stores, ViewModels for the 7 built domain slices, shared stores, presenters, forms, pagination/search, and a composition root.

**Architecture:** Class ViewModels own vanilla Zustand stores and delegate to Phase-5 application services via a shared `trackQuery`/`executeCommand` pipeline that standardizes loading states, error translation, and notifications. Cross-cutting state (session/selection, notifications, dialogs, navigation, connectivity) lives in shared stores. The package is 100 % React-free.

**Tech Stack:** TypeScript (strict), zustand@^5 (`zustand/vanilla` only), Vitest, ESLint flat config boundary guards, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-07-19-phase-6-presentation-layer-design.md` (approved & committed).

## Global Constraints

- Work on branch `phase-6-presentation-layer`, created from `main` (Task 1). Commit after every task with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- All commands run from repo root: `c:\Users\Alvin Dogba Jr\Desktop\Walamen\desktop-client-nemis`.
- Runtime deps: ONLY `@nemis-desktop/application`, `@nemis-desktop/types`, `zustand`. Import zustand ONLY from `'zustand/vanilla'`. NEVER import `react`, `next`, `electron`, `better-sqlite3`, or `@nemis-desktop/domain` in non-test source (enforced by ESLint in Task 1). Domain is allowed ONLY in `*.test.ts` and `src/testing/**` for seeding fakes; because pnpm needs a declared dependency to resolve it there, `@nemis-desktop/domain` is a **devDependency** (test-only — kept out of runtime `dependencies` so the production boundary holds). It is added when the first domain-seeding test lands (Task 13's ClassRoster test, which must seed a `Class` entity directly since no application use case creates one).
- TypeScript strict + `noUncheckedIndexedAccess` (indexing may return `undefined` — guard it). Named exports only. No `any`. No default exports. `"type": "module"`.
- Scoped test run during development: `pnpm vitest run packages/presentation` (fast, no SQLite). Do NOT run full `pnpm test` until the final task — the repo's better-sqlite3 is currently built for the **Electron** ABI; the final task handles `pnpm rebuild:node` / `pnpm rebuild:electron`.
- Run `pnpm prettier --write packages/presentation docs eslint.config.mjs` before each commit so no formatting-fix commit is needed later.
- View types never expose domain entities; mappers consume application DTOs (`StudentOutput`, `PagedResult<T>`, etc.) and produce display-ready view models (formatted strings + `StatusPresentation` badges).
- Every task's test file lives next to its source (`foo.ts` / `foo.test.ts`), matching Phase 4/5 convention. Root vitest config already includes `packages/**/src/**/*.test.ts`.

## File Map (what exists when done)

```
packages/presentation/
  package.json  tsconfig.json  eslint.config.mjs
  src/
    index.ts                                  # public API (Task 17)
    core/async-state.ts        core/submission.ts      core/async-runner.ts
    errors/presentation-error.ts  errors/to-presentation-error.ts  errors/index.ts
    notifications/notification.ts
    stores/notification-store.ts  stores/session-store.ts  stores/connectivity-store.ts
    stores/dialog-store.ts        stores/navigation-store.ts
    navigation/route.ts
    selectors/session-selectors.ts  selectors/connectivity-selectors.ts
    selectors/students-selectors.ts
    constants/defaults.ts
    pagination/pagination.ts   filters/filter-descriptor.ts   search/search-state.ts
    forms/form-manager.ts      validators/form-validators.ts
    formatters/format-date.ts  formatters/format-text.ts  formatters/format-marks.ts
    presenters/status-presentation.ts  presenters/present-status.ts
    mappers/students/student-view-mapper.ts       (+ academics, attendance,
      assessments, institution, infra, identity view-mappers)
    commands/students/*.ts  commands/academics/*.ts  commands/attendance/*.ts
      commands/assessments/*.ts  commands/settings/*.ts  commands/device/*.ts
    queries/students/*.ts   queries/academics/*.ts   queries/attendance/*.ts
      queries/assessments/*.ts  queries/settings/*.ts  queries/identity/*.ts
    view-models/students/  view-models/class-roster/  view-models/attendance/
      view-models/assessments/  view-models/settings/  view-models/device/
      view-models/current-user/  view-models/dashboard/  view-models/teachers/
      view-models/sync/  view-models/_extension-template/README.md
    testing/create-test-application.ts
    factories/create-presentation-layer.ts
docs/presentation-layer.md    (+ conventions.md section)
```

---

### Task 1: Package scaffold + ESLint boundary guard

**Files:**

- Create: `packages/presentation/package.json`
- Create: `packages/presentation/tsconfig.json`
- Create: `packages/presentation/eslint.config.mjs`
- Create: `packages/presentation/src/index.ts`
- Create: `packages/presentation/src/package-setup.test.ts`
- Modify: `eslint.config.mjs` (repo root)

**Interfaces:**

- Consumes: nothing (first task).
- Produces: the `@nemis-desktop/presentation` workspace package; ESLint guards `presentationImportGuard`, `presentationTestImportRelaxation`, `presentationLintRules`; zustand available.

- [ ] **Step 1: Create branch**

```bash
git checkout main && git checkout -b phase-6-presentation-layer
```

- [ ] **Step 2: Write the failing smoke test**

`packages/presentation/src/package-setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';

describe('package setup', () => {
  it('creates and updates a vanilla zustand store', () => {
    const store = createStore<{ n: number }>(() => ({ n: 1 }));
    store.setState({ n: 2 });
    expect(store.getState().n).toBe(2);
  });
});
```

Run: `pnpm vitest run packages/presentation` → FAIL (package/zustand not installed yet).

- [ ] **Step 3: Create the package**

`packages/presentation/package.json`:

```json
{
  "name": "@nemis-desktop/presentation",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nemis-desktop/application": "workspace:*",
    "@nemis-desktop/types": "workspace:*",
    "zustand": "^5.0.0"
  }
}
```

`packages/presentation/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/presentation/src/index.ts` (placeholder; Task 17 writes the real API):

```ts
export {};
```

Run: `pnpm install`

- [ ] **Step 4: Add the boundary guard**

`packages/presentation/eslint.config.mjs`:

```js
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
```

Modify root `eslint.config.mjs` — add the import after the application import line, and register the three blocks after `applicationLintRules` (order matters: the test relaxation must come after the guard):

```js
import {
  presentationImportGuard,
  presentationTestImportRelaxation,
  presentationLintRules,
} from './packages/presentation/eslint.config.mjs';
```

```js
  domainImportGuard,
  applicationImportGuard,
  applicationLintRules,
  presentationImportGuard,
  presentationTestImportRelaxation,
  presentationLintRules,
  prettier,
```

- [ ] **Step 5: Verify test passes and guard rejects a forbidden import**

Run: `pnpm vitest run packages/presentation` → PASS (1 test).

Create `packages/presentation/src/_forbidden.ts` containing exactly:

```ts
import 'electron';
```

Run: `pnpm lint` → expect an error on `_forbidden.ts` mentioning "must not depend on Electron". Then create `packages/presentation/src/_forbidden2.ts` containing exactly:

```ts
import '@nemis-desktop/domain';
```

Run: `pnpm lint` → expect "never domain entities" error. Delete both files, run `pnpm lint` → clean. Run `pnpm typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
pnpm prettier --write packages/presentation eslint.config.mjs
git add packages/presentation eslint.config.mjs pnpm-lock.yaml
git commit -m "feat(presentation): scaffold @nemis-desktop/presentation with boundary guards"
```

---

### Task 2: AsyncState + ViewStatus + SubmissionStatus (core)

**Files:**

- Create: `packages/presentation/src/core/async-state.ts`
- Create: `packages/presentation/src/core/submission.ts`
- Test: `packages/presentation/src/core/async-state.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `AsyncState<T>` = discriminated union on `status`: `'idle' | 'loading' | 'refreshing'(data: T) | 'success'(data: T) | 'empty' | 'error'(error: PresentationError placeholder — see note)`
  - `idleState<T>(): AsyncState<T>`, `hasData<T>(s): s is …{data: T}`, `isBusy(s): boolean`
  - `ViewStatus` union, `toViewStatus(state, ctx?)`
  - `SubmissionStatus = 'idle' | 'submitting' | 'submitted' | 'failed'`

**Note:** to avoid a forward dependency on Task 3, `async-state.ts` types the error slot as its own minimal interface `PresentationErrorLike { readonly kind: string; readonly userMessage: string }` — Task 3's `PresentationError` structurally satisfies it. Do NOT import from `../errors` here.

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/core/async-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasData, idleState, isBusy, toViewStatus, type AsyncState } from './async-state';

describe('AsyncState', () => {
  it('idleState creates idle', () => {
    expect(idleState<number>()).toEqual({ status: 'idle' });
  });

  it('hasData narrows success and refreshing', () => {
    const success: AsyncState<number> = { status: 'success', data: 4 };
    const refreshing: AsyncState<number> = { status: 'refreshing', data: 2 };
    expect(hasData(success) && success.data).toBe(4);
    expect(hasData(refreshing) && refreshing.data).toBe(2);
    expect(hasData({ status: 'loading' })).toBe(false);
  });

  it('isBusy is true only for loading and refreshing', () => {
    expect(isBusy({ status: 'loading' })).toBe(true);
    expect(isBusy({ status: 'refreshing', data: 1 })).toBe(true);
    expect(isBusy({ status: 'idle' })).toBe(false);
  });

  it('toViewStatus passes the base status through by default', () => {
    expect(toViewStatus({ status: 'success', data: 1 })).toBe('success');
  });

  it('toViewStatus reports offline when offline and nothing is shown', () => {
    expect(toViewStatus({ status: 'idle' }, { isOffline: true, isSyncing: false })).toBe('offline');
    expect(
      toViewStatus(
        { status: 'error', error: { kind: 'loading', userMessage: 'x' } },
        { isOffline: true, isSyncing: false },
      ),
    ).toBe('offline');
    // data on screen wins over the offline badge
    expect(
      toViewStatus({ status: 'success', data: 1 }, { isOffline: true, isSyncing: false }),
    ).toBe('success');
  });

  it('toViewStatus reports syncing while data is shown during a sync', () => {
    expect(
      toViewStatus({ status: 'success', data: 1 }, { isOffline: false, isSyncing: true }),
    ).toBe('syncing');
    expect(toViewStatus({ status: 'loading' }, { isOffline: false, isSyncing: true })).toBe(
      'loading',
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL (module not found).

- [ ] **Step 3: Implement**

`packages/presentation/src/core/submission.ts`:

```ts
/** Lifecycle of a user-triggered command (form submit, button action). */
export type SubmissionStatus = 'idle' | 'submitting' | 'submitted' | 'failed';
```

`packages/presentation/src/core/async-state.ts`:

```ts
/** Minimal structural view of a presentation error, so core has no dependency
 * on the errors module. `PresentationError` (errors/) satisfies this. */
export interface PresentationErrorLike {
  readonly kind: string;
  readonly userMessage: string;
}

/** The standard request lifecycle every screen exposes. `refreshing` keeps the
 * previous data on screen while a reload is in flight. */
export type AsyncState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'refreshing'; readonly data: T }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly error: PresentationErrorLike };

export function idleState<T>(): AsyncState<T> {
  return { status: 'idle' };
}

export function hasData<T>(
  state: AsyncState<T>,
): state is Extract<AsyncState<T>, { readonly data: T }> {
  return state.status === 'success' || state.status === 'refreshing';
}

export function isBusy<T>(state: AsyncState<T>): boolean {
  return state.status === 'loading' || state.status === 'refreshing';
}

/** What the UI should render, combining a request state with global
 * connectivity/sync context. Offline never hides data already on screen;
 * syncing only decorates states that show data. */
export type ViewStatus =
  'idle' | 'loading' | 'refreshing' | 'success' | 'empty' | 'error' | 'offline' | 'syncing';

export interface ViewStatusContext {
  readonly isOffline: boolean;
  readonly isSyncing: boolean;
}

export function toViewStatus<T>(state: AsyncState<T>, ctx?: ViewStatusContext): ViewStatus {
  if (ctx?.isOffline && (state.status === 'idle' || state.status === 'error')) return 'offline';
  if (ctx?.isSyncing && hasData(state)) return 'syncing';
  return state.status;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src/core
git commit -m "feat(presentation): add AsyncState/ViewStatus/SubmissionStatus core"
```

---

### Task 3: Presentation error taxonomy + translator

**Files:**

- Create: `packages/presentation/src/errors/presentation-error.ts`
- Create: `packages/presentation/src/errors/to-presentation-error.ts`
- Create: `packages/presentation/src/errors/index.ts`
- Test: `packages/presentation/src/errors/errors.test.ts`

**Interfaces:**

- Consumes: `ApplicationValidationException` (`.issues: {field,message}[]`), `PermissionDeniedException`, `UseCaseException`, `WorkflowException` from `@nemis-desktop/application` (all extend `ApplicationException` with `.code`, renderer-safe `.message`).
- Produces:
  - `PresentationErrorKind = 'validation' | 'permission' | 'operation-failed' | 'loading' | 'network-unavailable' | 'unexpected' | 'not-implemented'`
  - `abstract class PresentationError extends Error { kind; userMessage }`
  - `ValidationError (fieldErrors: Readonly<Record<string,string>>)`, `PermissionError`, `OperationFailedError`, `LoadingError`, `NetworkUnavailableError`, `UnexpectedPresentationError`, `NotImplementedPresentationError(feature: string)`
  - `toPresentationError(err: unknown, context: 'query' | 'command'): PresentationError`

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/errors/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ApplicationValidationException,
  PermissionDeniedException,
  UseCaseException,
  WorkflowException,
} from '@nemis-desktop/application';
import {
  LoadingError,
  NotImplementedPresentationError,
  OperationFailedError,
  PermissionError,
  PresentationError,
  UnexpectedPresentationError,
  ValidationError,
  toPresentationError,
} from './index';

describe('toPresentationError', () => {
  it('maps validation issues onto fieldErrors', () => {
    const err = toPresentationError(
      new ApplicationValidationException('invalid', [
        { field: 'firstName', message: 'firstName is required' },
      ]),
      'command',
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors['firstName']).toBe('firstName is required');
    expect(err.userMessage).toBe('Please correct the highlighted fields.');
  });

  it('maps permission denied', () => {
    expect(toPresentationError(new PermissionDeniedException('no'), 'command')).toBeInstanceOf(
      PermissionError,
    );
  });

  it('maps use-case and workflow failures to OperationFailedError keeping the message', () => {
    const err = toPresentationError(new UseCaseException('Grade is not publishable'), 'command');
    expect(err).toBeInstanceOf(OperationFailedError);
    expect(err.userMessage).toBe('Grade is not publishable');
    expect(
      toPresentationError(new WorkflowException('Student not found'), 'command'),
    ).toBeInstanceOf(OperationFailedError);
  });

  it('maps unknown errors by context', () => {
    expect(toPresentationError(new Error('boom'), 'query')).toBeInstanceOf(LoadingError);
    expect(toPresentationError(new Error('boom'), 'command')).toBeInstanceOf(
      UnexpectedPresentationError,
    );
  });

  it('passes presentation errors through untouched', () => {
    const original = new NotImplementedPresentationError('Dashboard');
    expect(toPresentationError(original, 'query')).toBe(original);
    expect(original.userMessage).toBe('Dashboard is not available yet.');
    expect(original).toBeInstanceOf(PresentationError);
  });

  it('keeps the original throwable as cause for unknown errors', () => {
    const boom = new Error('boom');
    expect(toPresentationError(boom, 'query').cause).toBe(boom);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/errors/presentation-error.ts`:

```ts
export type PresentationErrorKind =
  | 'validation'
  | 'permission'
  | 'operation-failed'
  | 'loading'
  | 'network-unavailable'
  | 'unexpected'
  | 'not-implemented';

/** Base for every error the presentation layer surfaces to the UI.
 * `userMessage` is always safe and understandable for end users; raw causes
 * stay on `cause` for logs. Satisfies core's PresentationErrorLike. */
export abstract class PresentationError extends Error {
  readonly kind: PresentationErrorKind;
  readonly userMessage: string;

  protected constructor(
    kind: PresentationErrorKind,
    userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
    this.name = new.target.name;
    this.kind = kind;
    this.userMessage = userMessage;
  }
}

export class ValidationError extends PresentationError {
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(userMessage: string, fieldErrors: Readonly<Record<string, string>> = {}) {
    super('validation', userMessage);
    this.fieldErrors = fieldErrors;
  }
}

export class PermissionError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('permission', userMessage, options);
  }
}

/** A business rule or workflow precondition rejected the action; the message
 * comes from the application layer and is renderer-safe. */
export class OperationFailedError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('operation-failed', userMessage, options);
  }
}

export class LoadingError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('loading', userMessage, options);
  }
}

/** Reserved for future IPC/REST transports; nothing maps to it yet. */
export class NetworkUnavailableError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('network-unavailable', userMessage, options);
  }
}

export class UnexpectedPresentationError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('unexpected', userMessage, options);
  }
}

/** Thrown by extension-point ViewModels whose domain has not been built yet. */
export class NotImplementedPresentationError extends PresentationError {
  constructor(feature: string) {
    super('not-implemented', `${feature} is not available yet.`);
  }
}
```

`packages/presentation/src/errors/to-presentation-error.ts`:

```ts
import {
  ApplicationValidationException,
  PermissionDeniedException,
  UseCaseException,
  WorkflowException,
} from '@nemis-desktop/application';
import {
  LoadingError,
  OperationFailedError,
  PermissionError,
  PresentationError,
  UnexpectedPresentationError,
  ValidationError,
} from './presentation-error';

/** Single translation point from application-layer (and unknown) errors into
 * UI-friendly presentation errors. Queries degrade to LoadingError; commands
 * to UnexpectedPresentationError. */
export function toPresentationError(err: unknown, context: 'query' | 'command'): PresentationError {
  if (err instanceof PresentationError) return err;

  if (err instanceof ApplicationValidationException) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) fieldErrors[issue.field] = issue.message;
    return new ValidationError('Please correct the highlighted fields.', fieldErrors);
  }
  if (err instanceof PermissionDeniedException) {
    return new PermissionError('You do not have permission to perform this action.', {
      cause: err,
    });
  }
  if (err instanceof UseCaseException || err instanceof WorkflowException) {
    return new OperationFailedError(err.message, { cause: err });
  }
  return context === 'query'
    ? new LoadingError('Something went wrong while loading. Please try again.', { cause: err })
    : new UnexpectedPresentationError('Something went wrong. Please try again.', { cause: err });
}
```

`packages/presentation/src/errors/index.ts`:

```ts
export * from './presentation-error';
export * from './to-presentation-error';
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src/errors
git commit -m "feat(presentation): add presentation error taxonomy and translator"
```

---

### Task 4: Notifications + NotificationStore

**Files:**

- Create: `packages/presentation/src/notifications/notification.ts`
- Create: `packages/presentation/src/stores/notification-store.ts`
- Test: `packages/presentation/src/stores/notification-store.test.ts`

**Interfaces:**

- Consumes: `createStore` from `zustand/vanilla`.
- Produces:
  - `NotificationKind = 'success' | 'info' | 'warning' | 'error'`
  - `UiNotification { id; kind; message; autoDismissMs: number | null; createdAt: number }`
  - `AUTO_DISMISS_MS: Readonly<Record<NotificationKind, number | null>>` (success 4000, info 4000, warning 6000, error null)
  - `NotificationState { notifications: readonly UiNotification[] }`
  - `class NotificationStore { store; notify(kind,message,opts?): string; success/info/warning/error(message): string; dismiss(id); clear() }` — constructor accepts `Partial<Record<NotificationKind, number | null>>` auto-dismiss overrides.

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/stores/notification-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NotificationStore } from './notification-store';

describe('NotificationStore', () => {
  it('appends notifications with per-kind auto-dismiss defaults', () => {
    const store = new NotificationStore();
    store.success('Saved.');
    store.error('Failed.');
    const { notifications } = store.store.getState();
    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.kind).toBe('success');
    expect(notifications[0]?.autoDismissMs).toBe(4000);
    expect(notifications[1]?.autoDismissMs).toBeNull();
  });

  it('honours constructor overrides and per-call overrides', () => {
    const store = new NotificationStore({ success: 1000 });
    store.success('a');
    store.notify('warning', 'b', { autoDismissMs: null });
    const { notifications } = store.store.getState();
    expect(notifications[0]?.autoDismissMs).toBe(1000);
    expect(notifications[1]?.autoDismissMs).toBeNull();
  });

  it('dismisses by id and clears', () => {
    const store = new NotificationStore();
    const id = store.info('hello');
    store.warning('there');
    store.dismiss(id);
    expect(store.store.getState().notifications).toHaveLength(1);
    store.clear();
    expect(store.store.getState().notifications).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/notifications/notification.ts`:

```ts
export type NotificationKind = 'success' | 'info' | 'warning' | 'error';

/** Presentation-only notification (toast/banner). No Electron notifications. */
export interface UiNotification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly message: string;
  /** null = requires manual dismissal. */
  readonly autoDismissMs: number | null;
  readonly createdAt: number;
}

export const AUTO_DISMISS_MS: Readonly<Record<NotificationKind, number | null>> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: null,
};
```

`packages/presentation/src/stores/notification-store.ts`:

```ts
import { createStore } from 'zustand/vanilla';
import {
  AUTO_DISMISS_MS,
  type NotificationKind,
  type UiNotification,
} from '../notifications/notification';

export interface NotificationState {
  readonly notifications: readonly UiNotification[];
}

export class NotificationStore {
  readonly store = createStore<NotificationState>(() => ({ notifications: [] }));
  private readonly autoDismiss: Readonly<Record<NotificationKind, number | null>>;
  private seq = 0;

  constructor(autoDismissOverrides?: Partial<Record<NotificationKind, number | null>>) {
    this.autoDismiss = { ...AUTO_DISMISS_MS, ...autoDismissOverrides };
  }

  notify(
    kind: NotificationKind,
    message: string,
    options?: { autoDismissMs?: number | null },
  ): string {
    this.seq += 1;
    const id = `ntf-${this.seq}`;
    const notification: UiNotification = {
      id,
      kind,
      message,
      autoDismissMs:
        options?.autoDismissMs !== undefined ? options.autoDismissMs : this.autoDismiss[kind],
      createdAt: Date.now(),
    };
    this.store.setState((s) => ({ notifications: [...s.notifications, notification] }));
    return id;
  }

  success(message: string): string {
    return this.notify('success', message);
  }
  info(message: string): string {
    return this.notify('info', message);
  }
  warning(message: string): string {
    return this.notify('warning', message);
  }
  error(message: string): string {
    return this.notify('error', message);
  }

  dismiss(id: string): void {
    this.store.setState((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    }));
  }

  clear(): void {
    this.store.setState({ notifications: [] });
  }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src/notifications packages/presentation/src/stores
git commit -m "feat(presentation): add notification model and NotificationStore"
```

---

### Task 5: Async runner pipeline (trackQuery / executeCommand)

**Files:**

- Create: `packages/presentation/src/core/async-runner.ts`
- Test: `packages/presentation/src/core/async-runner.test.ts`

**Interfaces:**

- Consumes: `AsyncState`, `hasData` (Task 2); `toPresentationError`, `PresentationError` (Task 3); `NotificationStore` (Task 4); `ApplicationResponse<T>` from `@nemis-desktop/application`.
- Produces:
  - `QueryStateAccess<TView> { get(): AsyncState<TView>; set(next: AsyncState<TView>): void }`
  - `trackQuery<TDto, TView>(opts: { access; fetch: () => Promise<ApplicationResponse<TDto | null>>; map: (dto: TDto) => TView; isEmpty?: (view: TView) => boolean; onData?: (dto: TDto) => void }): Promise<void>`
  - `CommandOutcome<TView> = { ok: true; data: TView } | { ok: false; error: PresentationError }`
  - `executeCommand<TDto, TView>(opts: { run: () => Promise<ApplicationResponse<TDto>>; map: (dto: TDto) => TView; notifications: NotificationStore; successMessage: string }): Promise<CommandOutcome<TView>>`

Behavioral contract (all asserted in tests): trackQuery sets `loading` when there is no data, `refreshing` (keeping data) when there is; `null`/`undefined` data or `isEmpty(view)` → `empty`; thrown → `error` with translated PresentationError; `onData` fires before `map`. executeCommand emits one success notification (plus one warning per `res.warnings` entry) on success, and one error notification with the translated error's `userMessage` on failure; it never throws.

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/core/async-runner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { UseCaseException, ok } from '@nemis-desktop/application';
import { NotificationStore } from '../stores/notification-store';
import { OperationFailedError, LoadingError } from '../errors';
import { idleState, type AsyncState } from './async-state';
import { executeCommand, trackQuery } from './async-runner';

function makeAccess<T>() {
  let state: AsyncState<T> = idleState<T>();
  const transitions: string[] = [];
  return {
    access: {
      get: () => state,
      set: (next: AsyncState<T>) => {
        state = next;
        transitions.push(next.status);
      },
    },
    read: () => state,
    transitions,
  };
}

describe('trackQuery', () => {
  it('goes loading → success and maps the DTO', async () => {
    const { access, read, transitions } = makeAccess<string>();
    await trackQuery({
      access,
      fetch: () => Promise.resolve(ok(21)),
      map: (n) => `n=${n * 2}`,
    });
    expect(transitions).toEqual(['loading', 'success']);
    expect(read()).toEqual({ status: 'success', data: 'n=42' });
  });

  it('goes refreshing when data already exists', async () => {
    const { access, transitions } = makeAccess<string>();
    access.set({ status: 'success', data: 'old' });
    await trackQuery({ access, fetch: () => Promise.resolve(ok(1)), map: String });
    expect(transitions.slice(1)).toEqual(['refreshing', 'success']);
  });

  it('maps null data and isEmpty views to empty', async () => {
    const a = makeAccess<string>();
    await trackQuery({
      access: a.access,
      fetch: () => Promise.resolve(ok<number | null>(null)),
      map: String,
    });
    expect(a.read().status).toBe('empty');

    const b = makeAccess<readonly number[]>();
    await trackQuery({
      access: b.access,
      fetch: () => Promise.resolve(ok<readonly number[]>([])),
      map: (xs) => xs,
      isEmpty: (xs) => xs.length === 0,
    });
    expect(b.read().status).toBe('empty');
  });

  it('translates thrown errors into error state and calls onData before map', async () => {
    const { access, read } = makeAccess<string>();
    await trackQuery({
      access,
      fetch: () => Promise.reject(new Error('boom')),
      map: String,
    });
    const state = read();
    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.error).toBeInstanceOf(LoadingError);

    const seen: number[] = [];
    const other = makeAccess<string>();
    await trackQuery({
      access: other.access,
      fetch: () => Promise.resolve(ok(7)),
      map: (n) => {
        seen.push(100 + n);
        return String(n);
      },
      onData: (n) => seen.push(n),
    });
    expect(seen).toEqual([7, 107]);
  });
});

describe('executeCommand', () => {
  it('returns ok with mapped view and notifies success plus warnings', async () => {
    const notifications = new NotificationStore();
    const outcome = await executeCommand({
      run: () => Promise.resolve(ok(5, ['heads up'])),
      map: (n: number) => n * 2,
      notifications,
      successMessage: 'Saved.',
    });
    expect(outcome).toEqual({ ok: true, data: 10 });
    const kinds = notifications.store.getState().notifications.map((n) => n.kind);
    expect(kinds).toEqual(['success', 'warning']);
  });

  it('returns the translated error and notifies with its userMessage', async () => {
    const notifications = new NotificationStore();
    const outcome = await executeCommand({
      run: () => Promise.reject(new UseCaseException('Grade is not publishable')),
      map: (n: number) => n,
      notifications,
      successMessage: 'Saved.',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBeInstanceOf(OperationFailedError);
    const first = notifications.store.getState().notifications[0];
    expect(first?.kind).toBe('error');
    expect(first?.message).toBe('Grade is not publishable');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/core/async-runner.ts`:

```ts
import type { ApplicationResponse } from '@nemis-desktop/application';
import { toPresentationError, type PresentationError } from '../errors';
import type { NotificationStore } from '../stores/notification-store';
import { hasData, type AsyncState } from './async-state';

export interface QueryStateAccess<TView> {
  get(): AsyncState<TView>;
  set(next: AsyncState<TView>): void;
}

/** The single query pipeline: loading/refreshing → success | empty | error.
 * ViewModels never hand-roll try/catch around application calls. */
export async function trackQuery<TDto, TView>(opts: {
  access: QueryStateAccess<TView>;
  fetch: () => Promise<ApplicationResponse<TDto | null>>;
  map: (dto: TDto) => TView;
  isEmpty?: (view: TView) => boolean;
  onData?: (dto: TDto) => void;
}): Promise<void> {
  const current = opts.access.get();
  opts.access.set(
    hasData(current) ? { status: 'refreshing', data: current.data } : { status: 'loading' },
  );
  try {
    const res = await opts.fetch();
    if (res.data === null || res.data === undefined) {
      opts.access.set({ status: 'empty' });
      return;
    }
    opts.onData?.(res.data);
    const view = opts.map(res.data);
    opts.access.set(opts.isEmpty?.(view) ? { status: 'empty' } : { status: 'success', data: view });
  } catch (err) {
    opts.access.set({ status: 'error', error: toPresentationError(err, 'query') });
  }
}

export type CommandOutcome<TView> =
  | { readonly ok: true; readonly data: TView }
  | { readonly ok: false; readonly error: PresentationError };

/** The single command pipeline: run → map → notify. Never throws. */
export async function executeCommand<TDto, TView>(opts: {
  run: () => Promise<ApplicationResponse<TDto>>;
  map: (dto: TDto) => TView;
  notifications: NotificationStore;
  successMessage: string;
}): Promise<CommandOutcome<TView>> {
  try {
    const res = await opts.run();
    const data = opts.map(res.data);
    opts.notifications.success(opts.successMessage);
    for (const warning of res.warnings ?? []) opts.notifications.warning(warning);
    return { ok: true, data };
  } catch (err) {
    const error = toPresentationError(err, 'command');
    opts.notifications.error(error.userMessage);
    return { ok: false, error };
  }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src/core
git commit -m "feat(presentation): add trackQuery/executeCommand async pipeline"
```

---

### Task 6: Pagination, filters, search, constants

**Files:**

- Create: `packages/presentation/src/constants/defaults.ts`
- Create: `packages/presentation/src/pagination/pagination.ts`
- Create: `packages/presentation/src/filters/filter-descriptor.ts`
- Create: `packages/presentation/src/search/search-state.ts`
- Test: `packages/presentation/src/pagination/pagination.test.ts`
- Test: `packages/presentation/src/search/search-state.test.ts`

**Interfaces:**

- Consumes: `PageRequest { limit; offset }` from `@nemis-desktop/application`.
- Produces:
  - `DEFAULT_PAGE_SIZE = 25`, `DEFAULT_SEARCH_DEBOUNCE_MS = 300`
  - `SortDirection = 'asc' | 'desc'`, `SortSpec { field: string; direction: SortDirection }`
  - `PaginationState { page; pageSize; totalCount; sort: SortSpec | null }` (page is 1-based)
  - pure fns: `createPagination(pageSize?)`, `toPageRequest(p): PageRequest`, `totalPages(p)`, `withPage(p, page)` (clamped), `withPageSize(p, pageSize)` (resets to page 1), `withTotal(p, totalCount)` (clamps page down), `withSort(p, sort: SortSpec | null)`
  - `FilterOperator = 'eq' | 'contains' | 'gte' | 'lte'`, `FilterDescriptor { field; operator; value: string | number | boolean }`
  - `SearchState { keyword; filters: readonly FilterDescriptor[]; debounceMs }`
  - pure fns: `createSearch(debounceMs?)`, `withKeyword(s, keyword)`, `withFilters(s, filters)`, `clearSearch(s)`, `matchesKeyword(fields: readonly string[], keyword: string): boolean`

- [ ] **Step 1: Write the failing tests**

`packages/presentation/src/pagination/pagination.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createPagination,
  toPageRequest,
  totalPages,
  withPage,
  withPageSize,
  withSort,
  withTotal,
} from './pagination';

describe('pagination', () => {
  it('creates 1-based defaults and converts to PageRequest', () => {
    const p = createPagination();
    expect(p).toEqual({ page: 1, pageSize: 25, totalCount: 0, sort: null });
    expect(toPageRequest(p)).toEqual({ limit: 25, offset: 0 });
    expect(toPageRequest(withPage(withTotal(p, 100), 3))).toEqual({ limit: 25, offset: 50 });
  });

  it('computes totalPages with a minimum of 1', () => {
    expect(totalPages(createPagination())).toBe(1);
    expect(totalPages(withTotal(createPagination(), 51))).toBe(3);
  });

  it('clamps page into range', () => {
    const p = withTotal(createPagination(), 30); // 2 pages
    expect(withPage(p, 0).page).toBe(1);
    expect(withPage(p, 99).page).toBe(2);
  });

  it('withPageSize resets to page 1 and withTotal clamps the current page down', () => {
    const p = withPage(withTotal(createPagination(), 100), 4);
    expect(withPageSize(p, 50)).toMatchObject({ page: 1, pageSize: 50 });
    expect(withTotal(p, 10).page).toBe(1);
  });

  it('withSort replaces the sort spec', () => {
    const sorted = withSort(createPagination(), { field: 'fullName', direction: 'desc' });
    expect(sorted.sort).toEqual({ field: 'fullName', direction: 'desc' });
    expect(withSort(sorted, null).sort).toBeNull();
  });
});
```

`packages/presentation/src/search/search-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clearSearch,
  createSearch,
  matchesKeyword,
  withFilters,
  withKeyword,
} from './search-state';

describe('search state', () => {
  it('creates defaults and updates immutably', () => {
    const s = createSearch();
    expect(s).toEqual({ keyword: '', filters: [], debounceMs: 300 });
    const withKw = withKeyword(s, 'ada');
    expect(withKw.keyword).toBe('ada');
    expect(s.keyword).toBe('');
    const filtered = withFilters(withKw, [{ field: 'isActive', operator: 'eq', value: true }]);
    expect(filtered.filters).toHaveLength(1);
    expect(clearSearch(filtered)).toEqual({ keyword: '', filters: [], debounceMs: 300 });
  });

  it('matchesKeyword is case-insensitive, trimmed, and true for empty keywords', () => {
    expect(matchesKeyword(['Ada Lovelace', 'ADM-001'], '  love ')).toBe(true);
    expect(matchesKeyword(['Ada Lovelace'], 'adm')).toBe(false);
    expect(matchesKeyword(['Ada'], '')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/constants/defaults.ts`:

```ts
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_SEARCH_DEBOUNCE_MS = 300;
```

`packages/presentation/src/pagination/pagination.ts`:

```ts
import type { PageRequest } from '@nemis-desktop/application';
import { DEFAULT_PAGE_SIZE } from '../constants/defaults';

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  readonly field: string;
  readonly direction: SortDirection;
}

/** Immutable pagination state; `page` is 1-based for display. */
export interface PaginationState {
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly sort: SortSpec | null;
}

export function createPagination(pageSize = DEFAULT_PAGE_SIZE): PaginationState {
  return { page: 1, pageSize, totalCount: 0, sort: null };
}

export function toPageRequest(p: PaginationState): PageRequest {
  return { limit: p.pageSize, offset: (p.page - 1) * p.pageSize };
}

export function totalPages(p: PaginationState): number {
  return Math.max(1, Math.ceil(p.totalCount / p.pageSize));
}

export function withPage(p: PaginationState, page: number): PaginationState {
  return { ...p, page: Math.min(Math.max(1, page), totalPages(p)) };
}

export function withPageSize(p: PaginationState, pageSize: number): PaginationState {
  return { ...p, pageSize, page: 1 };
}

export function withTotal(p: PaginationState, totalCount: number): PaginationState {
  const next = { ...p, totalCount };
  return { ...next, page: Math.min(next.page, totalPages(next)) };
}

export function withSort(p: PaginationState, sort: SortSpec | null): PaginationState {
  return { ...p, sort };
}
```

`packages/presentation/src/filters/filter-descriptor.ts`:

```ts
export type FilterOperator = 'eq' | 'contains' | 'gte' | 'lte';

/** A declarative filter the UI builds and a (future server-backed) query
 * interprets. Kept as data so sync/server search can adopt it unchanged. */
export interface FilterDescriptor {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: string | number | boolean;
}
```

`packages/presentation/src/search/search-state.ts`:

```ts
import { DEFAULT_SEARCH_DEBOUNCE_MS } from '../constants/defaults';
import type { FilterDescriptor } from '../filters/filter-descriptor';

export interface SearchState {
  readonly keyword: string;
  readonly filters: readonly FilterDescriptor[];
  /** Debounce policy as data; the UI layer owns timers. */
  readonly debounceMs: number;
}

export function createSearch(debounceMs = DEFAULT_SEARCH_DEBOUNCE_MS): SearchState {
  return { keyword: '', filters: [], debounceMs };
}

export function withKeyword(s: SearchState, keyword: string): SearchState {
  return { ...s, keyword };
}

export function withFilters(s: SearchState, filters: readonly FilterDescriptor[]): SearchState {
  return { ...s, filters };
}

export function clearSearch(s: SearchState): SearchState {
  return { ...s, keyword: '', filters: [] };
}

/** Client-side keyword match over display fields. Used until server-backed
 * search lands (ListStudentsDto has no keyword yet — documented limitation). */
export function matchesKeyword(fields: readonly string[], keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (needle === '') return true;
  return fields.some((f) => f.toLowerCase().includes(needle));
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src
git commit -m "feat(presentation): add pagination, filter, and search infrastructure"
```

---

### Task 7: Form infrastructure (FormManager + validators)

**Files:**

- Create: `packages/presentation/src/forms/form-manager.ts`
- Create: `packages/presentation/src/validators/form-validators.ts`
- Test: `packages/presentation/src/forms/form-manager.test.ts`

**Interfaces:**

- Consumes: `createStore` (zustand/vanilla), `SubmissionStatus` (Task 2), `PresentationError`, `ValidationError` (Task 3).
- Produces:
  - `FormState<TValues> { values; errors: Readonly<Partial<Record<keyof TValues & string, string>>>; isDirty; submission: SubmissionStatus; submitError: PresentationError | null }`
  - `FormValidator<TValues> = (values: TValues) => Partial<Record<keyof TValues & string, string>>`
  - `class FormManager<TValues extends Record<string, unknown>> { store; setValue(field, value); validate(): boolean; reset(); beginSubmit(); completeSubmit(); failSubmit(error); applyExternalErrors(error) }`
  - validators: `required<TValues>(...fields)`, `maxLength<TValues>(field, max)`, `isoDate<TValues>(field)` — presentational checks only (business validation stays in application/domain).

Behavior asserted in tests: `setValue` updates the value, recomputes `isDirty` against initial values, and clears that field's error; `validate` merges all validators and returns whether the form is clean; `reset` restores the initial state entirely; `failSubmit` sets `submission: 'failed'`, keeps the error, and copies `ValidationError.fieldErrors` onto field errors.

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/forms/form-manager.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { isoDate, maxLength, required } from '../validators/form-validators';
import { FormManager } from './form-manager';

interface StudentFormValues extends Record<string, unknown> {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

const initial: StudentFormValues = { firstName: '', lastName: '', dateOfBirth: '' };

function build() {
  return new FormManager<StudentFormValues>(initial, [
    required('firstName', 'lastName'),
    maxLength('firstName', 50),
    isoDate('dateOfBirth'),
  ]);
}

describe('FormManager', () => {
  it('tracks values and dirtiness, clearing the edited field error', () => {
    const form = build();
    expect(form.store.getState().isDirty).toBe(false);
    form.validate();
    expect(form.store.getState().errors.firstName).toBe('This field is required.');
    form.setValue('firstName', 'Ada');
    const state = form.store.getState();
    expect(state.values.firstName).toBe('Ada');
    expect(state.isDirty).toBe(true);
    expect(state.errors.firstName).toBeUndefined();
    form.setValue('firstName', '');
    expect(form.store.getState().isDirty).toBe(false);
  });

  it('validate merges validators and reports validity', () => {
    const form = build();
    form.setValue('firstName', 'Ada');
    form.setValue('lastName', 'Lovelace');
    form.setValue('dateOfBirth', 'not-a-date');
    expect(form.validate()).toBe(false);
    expect(form.store.getState().errors.dateOfBirth).toBe('Enter a valid date.');
    form.setValue('dateOfBirth', '2015-06-01');
    expect(form.validate()).toBe(true);
  });

  it('runs the submission lifecycle and applies external field errors', () => {
    const form = build();
    form.beginSubmit();
    expect(form.store.getState().submission).toBe('submitting');
    const error = new ValidationError('Please correct the highlighted fields.', {
      firstName: 'firstName is required',
    });
    form.failSubmit(error);
    const state = form.store.getState();
    expect(state.submission).toBe('failed');
    expect(state.submitError).toBe(error);
    expect(state.errors.firstName).toBe('firstName is required');
    form.completeSubmit();
    expect(form.store.getState().submission).toBe('submitted');
  });

  it('reset restores the initial state', () => {
    const form = build();
    form.setValue('firstName', 'Ada');
    form.validate();
    form.beginSubmit();
    form.reset();
    expect(form.store.getState()).toEqual({
      values: initial,
      errors: {},
      isDirty: false,
      submission: 'idle',
      submitError: null,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/validators/form-validators.ts`:

```ts
/** Presentational validators only (required/format/length). Business rules
 * stay in the application and domain layers. */
export type FormValidator<TValues> = (
  values: TValues,
) => Partial<Record<keyof TValues & string, string>>;

export function required<TValues>(
  ...fields: readonly (keyof TValues & string)[]
): FormValidator<TValues> {
  return (values) => {
    const errors: Partial<Record<keyof TValues & string, string>> = {};
    for (const field of fields) {
      const value = values[field];
      if (
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        errors[field] = 'This field is required.';
      }
    }
    return errors;
  };
}

export function maxLength<TValues>(
  field: keyof TValues & string,
  max: number,
): FormValidator<TValues> {
  return (values) => {
    const value = values[field];
    return typeof value === 'string' && value.length > max
      ? ({ [field]: `Must be at most ${max} characters.` } as Partial<
          Record<keyof TValues & string, string>
        >)
      : {};
  };
}

/** Accepts an ISO-8601 date (YYYY-MM-DD, optional time) that also parses to a
 * real calendar date — rejects Date.parse-permissive non-ISO strings like
 * "01/02/2020" that the validator's name would otherwise silently allow. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export function isoDate<TValues>(field: keyof TValues & string): FormValidator<TValues> {
  return (values) => {
    const value = values[field];
    if (typeof value !== 'string' || value === '') return {};
    const valid = ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
    return valid
      ? {}
      : ({ [field]: 'Enter a valid date.' } as Partial<Record<keyof TValues & string, string>>);
  };
}
```

`packages/presentation/src/forms/form-manager.ts`:

```ts
import { createStore } from 'zustand/vanilla';
import type { SubmissionStatus } from '../core/submission';
import { ValidationError, type PresentationError } from '../errors';
import type { FormValidator } from '../validators/form-validators';

export interface FormState<TValues extends Record<string, unknown>> {
  readonly values: TValues;
  readonly errors: Readonly<Partial<Record<keyof TValues & string, string>>>;
  readonly isDirty: boolean;
  readonly submission: SubmissionStatus;
  readonly submitError: PresentationError | null;
}

/** Reusable form state machine: values, per-field errors, dirty tracking,
 * reset, and submission lifecycle. Framework-free; React binds later. */
export class FormManager<TValues extends Record<string, unknown>> {
  readonly store;
  private readonly initialValues: TValues;

  constructor(
    initialValues: TValues,
    private readonly validators: readonly FormValidator<TValues>[] = [],
  ) {
    this.initialValues = { ...initialValues };
    this.store = createStore<FormState<TValues>>(() => ({
      values: { ...initialValues },
      errors: {} as Partial<Record<keyof TValues & string, string>>,
      isDirty: false,
      submission: 'idle',
      submitError: null,
    }));
  }

  setValue<K extends keyof TValues & string>(field: K, value: TValues[K]): void {
    const state = this.store.getState();
    const values = { ...state.values };
    values[field] = value;
    const errors = { ...state.errors };
    delete errors[field];
    const isDirty = (Object.keys(values) as (keyof TValues & string)[]).some(
      (key) => !Object.is(values[key], this.initialValues[key]),
    );
    this.store.setState({ values, errors, isDirty });
  }

  validate(): boolean {
    const values = this.store.getState().values;
    let errors: Partial<Record<keyof TValues & string, string>> = {};
    for (const validator of this.validators) errors = { ...errors, ...validator(values) };
    this.store.setState({ errors });
    return Object.keys(errors).length === 0;
  }

  reset(): void {
    this.store.setState(
      {
        values: { ...this.initialValues },
        errors: {} as Partial<Record<keyof TValues & string, string>>,
        isDirty: false,
        submission: 'idle',
        submitError: null,
      },
      true,
    );
  }

  beginSubmit(): void {
    this.store.setState({ submission: 'submitting', submitError: null });
  }

  completeSubmit(): void {
    this.store.setState({ submission: 'submitted' });
  }

  failSubmit(error: PresentationError): void {
    this.store.setState({ submission: 'failed', submitError: error });
    this.applyExternalErrors(error);
  }

  /** Copies field errors from a command's ValidationError onto the form. */
  applyExternalErrors(error: PresentationError): void {
    if (!(error instanceof ValidationError)) return;
    const errors: Record<string, string | undefined> = { ...this.store.getState().errors };
    for (const [field, message] of Object.entries(error.fieldErrors)) errors[field] = message;
    this.store.setState({
      errors: errors as Partial<Record<keyof TValues & string, string>>,
    });
  }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src/forms packages/presentation/src/validators
git commit -m "feat(presentation): add FormManager and presentational validators"
```

---

### Task 8: Formatters

**Files:**

- Create: `packages/presentation/src/formatters/format-date.ts`
- Create: `packages/presentation/src/formatters/format-text.ts`
- Create: `packages/presentation/src/formatters/format-marks.ts`
- Test: `packages/presentation/src/formatters/formatters.test.ts`

**Interfaces:**

- Consumes: `GradeLevel` from `@nemis-desktop/types`.
- Produces (all pure):
  - `formatIsoDate(iso: string): string` → `'19 Jul 2026'`; invalid → `'—'`
  - `formatIsoDateTime(iso: string): string` → `'19 Jul 2026, 12:00'` (UTC, 24h); invalid → `'—'`
  - `formatFullName(firstName: string, lastName: string, middleName?: string): string`
  - `humanizeEnum(value: string): string` → `'UNDER_REVIEW'` → `'Under review'`
  - `formatGradeLevel(gradeLevel?: GradeLevel): string` → `'GRADE_1'` → `'Grade 1'`, `'KG'` → `'KG'`, undefined → `'—'`
  - `formatMarks(obtained: number, total: number): string` → `'45 / 100'`
  - `formatPercent(obtained: number, total: number): string` → `'45%'`; `total <= 0` → `'—'`

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/formatters/formatters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GradeLevel } from '@nemis-desktop/types';
import { formatIsoDate, formatIsoDateTime } from './format-date';
import { formatFullName, formatGradeLevel, humanizeEnum } from './format-text';
import { formatMarks, formatPercent } from './format-marks';

describe('formatters', () => {
  it('formats ISO dates and datetimes in UTC', () => {
    expect(formatIsoDate('2026-07-19')).toBe('19 Jul 2026');
    expect(formatIsoDateTime('2026-07-19T12:00:00.000Z')).toBe('19 Jul 2026, 12:00');
    expect(formatIsoDate('garbage')).toBe('—');
    expect(formatIsoDateTime('garbage')).toBe('—');
  });

  it('formats names', () => {
    expect(formatFullName('Ada', 'Lovelace')).toBe('Ada Lovelace');
    expect(formatFullName('Ada', 'Lovelace', 'King')).toBe('Ada King Lovelace');
  });

  it('humanizes enum values', () => {
    expect(humanizeEnum('UNDER_REVIEW')).toBe('Under review');
    expect(humanizeEnum('PRESENT')).toBe('Present');
  });

  it('formats grade levels', () => {
    expect(formatGradeLevel(GradeLevel.GRADE_1)).toBe('Grade 1');
    expect(formatGradeLevel(GradeLevel.KG)).toBe('KG');
    expect(formatGradeLevel(undefined)).toBe('—');
  });

  it('formats marks and percentages', () => {
    expect(formatMarks(45, 100)).toBe('45 / 100');
    expect(formatPercent(45, 100)).toBe('45%');
    expect(formatPercent(1, 3)).toBe('33%');
    expect(formatPercent(1, 0)).toBe('—');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/formatters/format-date.ts`:

```ts
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function formatIsoDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : DATE.format(t);
}

export function formatIsoDateTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : DATE_TIME.format(t);
}
```

`packages/presentation/src/formatters/format-text.ts`:

```ts
import type { GradeLevel } from '@nemis-desktop/types';

export function formatFullName(firstName: string, lastName: string, middleName?: string): string {
  return [firstName, middleName, lastName].filter(Boolean).join(' ');
}

/** 'UNDER_REVIEW' → 'Under review'. */
export function humanizeEnum(value: string): string {
  const words = value.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatGradeLevel(gradeLevel?: GradeLevel): string {
  if (!gradeLevel) return '—';
  return gradeLevel.startsWith('GRADE_')
    ? `Grade ${gradeLevel.slice('GRADE_'.length)}`
    : gradeLevel;
}
```

`packages/presentation/src/formatters/format-marks.ts`:

```ts
export function formatMarks(obtained: number, total: number): string {
  return `${obtained} / ${total}`;
}

export function formatPercent(obtained: number, total: number): string {
  return total > 0 ? `${Math.round((obtained / total) * 100)}%` : '—';
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS. (If the two `Intl` assertions differ on this Node version, adjust the expected strings to the actual `en-GB` output — the formatter contract is "deterministic UTC en-GB", not a specific ICU build.)

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src/formatters
git commit -m "feat(presentation): add pure display formatters"
```

---

### Task 9: Status presenters (badge tokens)

**Files:**

- Create: `packages/presentation/src/presenters/status-presentation.ts`
- Create: `packages/presentation/src/presenters/present-status.ts`
- Test: `packages/presentation/src/presenters/present-status.test.ts`

**Interfaces:**

- Consumes: `AttendanceStatus`, `EnrollmentStatus`, `GradeStatus`, `ApprovalStatus` from `@nemis-desktop/types`; `formatIsoDateTime` (Task 8); `SyncStatus` — defined HERE as `'idle' | 'syncing' | 'failed'` (Task 10's ConnectivityStore imports it from here to avoid a cycle).
- Produces:
  - `BadgeToken = 'success' | 'active' | 'pending' | 'error' | 'neutral'` (semantic names; the UI maps tokens to the enterprise palette — never hex here)
  - `StatusPresentation { label: string; badge: BadgeToken }`
  - `SyncStatus`
  - `presentActive(isActive: boolean)`, `presentAttendanceStatus(status)`, `presentEnrollmentStatus(status)`, `presentGradeStatus(status, isPublished)`, `presentApprovalStatus(status)`, `presentSyncStatus(status: SyncStatus, lastSyncAt: string | null)`, `presentConnectivity(isOnline: boolean)` — all return `StatusPresentation`.

Fixed mappings (exhaustive `Record` lookups):

- Attendance: PRESENT→`Present`/success, ABSENT→`Absent`/error, LATE→`Late`/pending, EXCUSED→`Excused`/neutral, SICK→`Sick`/pending
- Enrollment: ACTIVE→`Active`/active, COMPLETED→`Completed`/success, WITHDRAWN→`Withdrawn`/neutral, TRANSFERRED→`Transferred`/pending, SUSPENDED→`Suspended`/error
- Grade: `isPublished || status === PUBLISHED`→`Published`/success; DRAFT→`Draft`/neutral, SUBMITTED→`Submitted`/pending, APPROVED→`Approved`/active, LOCKED→`Locked`/neutral
- Approval: APPROVED→`Approved`/success, PENDING→`Pending`/pending, UNDER_REVIEW→`Under review`/pending, REJECTED→`Rejected`/error
- Sync: idle→(`Last synced <formatIsoDateTime(lastSyncAt)>` or `Not synced yet`)/neutral, syncing→`Syncing…`/pending, failed→`Sync failed`/error
- Connectivity: online→`Online`/success, offline→`Offline`/pending
- Active flag: true→`Active`/active, false→`Inactive`/neutral

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/presenters/present-status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ApprovalStatus,
  AttendanceStatus,
  EnrollmentStatus,
  GradeStatus,
} from '@nemis-desktop/types';
import {
  presentActive,
  presentApprovalStatus,
  presentAttendanceStatus,
  presentConnectivity,
  presentEnrollmentStatus,
  presentGradeStatus,
  presentSyncStatus,
} from './present-status';

describe('status presenters', () => {
  it('presents the active flag', () => {
    expect(presentActive(true)).toEqual({ label: 'Active', badge: 'active' });
    expect(presentActive(false)).toEqual({ label: 'Inactive', badge: 'neutral' });
  });

  it('presents attendance statuses', () => {
    expect(presentAttendanceStatus(AttendanceStatus.PRESENT)).toEqual({
      label: 'Present',
      badge: 'success',
    });
    expect(presentAttendanceStatus(AttendanceStatus.ABSENT).badge).toBe('error');
    expect(presentAttendanceStatus(AttendanceStatus.LATE).badge).toBe('pending');
  });

  it('presents enrollment statuses', () => {
    expect(presentEnrollmentStatus(EnrollmentStatus.ACTIVE).badge).toBe('active');
    expect(presentEnrollmentStatus(EnrollmentStatus.WITHDRAWN)).toEqual({
      label: 'Withdrawn',
      badge: 'neutral',
    });
  });

  it('presents grade statuses with publication overriding', () => {
    expect(presentGradeStatus(GradeStatus.DRAFT, false)).toEqual({
      label: 'Draft',
      badge: 'neutral',
    });
    expect(presentGradeStatus(GradeStatus.SUBMITTED, false).badge).toBe('pending');
    expect(presentGradeStatus(GradeStatus.SUBMITTED, true)).toEqual({
      label: 'Published',
      badge: 'success',
    });
    expect(presentGradeStatus(GradeStatus.PUBLISHED, false).label).toBe('Published');
  });

  it('presents approval statuses', () => {
    expect(presentApprovalStatus(ApprovalStatus.APPROVED).badge).toBe('success');
    expect(presentApprovalStatus(ApprovalStatus.UNDER_REVIEW).label).toBe('Under review');
  });

  it('presents sync and connectivity', () => {
    expect(presentSyncStatus('idle', null)).toEqual({ label: 'Not synced yet', badge: 'neutral' });
    expect(presentSyncStatus('idle', '2026-07-19T12:00:00.000Z').label).toBe(
      'Last synced 19 Jul 2026, 12:00',
    );
    expect(presentSyncStatus('syncing', null)).toEqual({ label: 'Syncing…', badge: 'pending' });
    expect(presentSyncStatus('failed', null)).toEqual({ label: 'Sync failed', badge: 'error' });
    expect(presentConnectivity(true)).toEqual({ label: 'Online', badge: 'success' });
    expect(presentConnectivity(false)).toEqual({ label: 'Offline', badge: 'pending' });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/presenters/status-presentation.ts`:

```ts
/** Semantic badge names; the UI maps these to the enterprise palette.
 * Presentation never emits hex colors. */
export type BadgeToken = 'success' | 'active' | 'pending' | 'error' | 'neutral';

export interface StatusPresentation {
  readonly label: string;
  readonly badge: BadgeToken;
}

/** Background sync lifecycle as shown to users. Owned here so both the
 * connectivity store and presenters can use it without a cycle. */
export type SyncStatus = 'idle' | 'syncing' | 'failed';
```

`packages/presentation/src/presenters/present-status.ts`:

```ts
import {
  ApprovalStatus,
  AttendanceStatus,
  EnrollmentStatus,
  GradeStatus,
} from '@nemis-desktop/types';
import { formatIsoDateTime } from '../formatters/format-date';
import type { StatusPresentation, SyncStatus } from './status-presentation';

export function presentActive(isActive: boolean): StatusPresentation {
  return isActive ? { label: 'Active', badge: 'active' } : { label: 'Inactive', badge: 'neutral' };
}

const ATTENDANCE: Record<AttendanceStatus, StatusPresentation> = {
  [AttendanceStatus.PRESENT]: { label: 'Present', badge: 'success' },
  [AttendanceStatus.ABSENT]: { label: 'Absent', badge: 'error' },
  [AttendanceStatus.LATE]: { label: 'Late', badge: 'pending' },
  [AttendanceStatus.EXCUSED]: { label: 'Excused', badge: 'neutral' },
  [AttendanceStatus.SICK]: { label: 'Sick', badge: 'pending' },
};

export function presentAttendanceStatus(status: AttendanceStatus): StatusPresentation {
  return ATTENDANCE[status];
}

const ENROLLMENT: Record<EnrollmentStatus, StatusPresentation> = {
  [EnrollmentStatus.ACTIVE]: { label: 'Active', badge: 'active' },
  [EnrollmentStatus.COMPLETED]: { label: 'Completed', badge: 'success' },
  [EnrollmentStatus.WITHDRAWN]: { label: 'Withdrawn', badge: 'neutral' },
  [EnrollmentStatus.TRANSFERRED]: { label: 'Transferred', badge: 'pending' },
  [EnrollmentStatus.SUSPENDED]: { label: 'Suspended', badge: 'error' },
};

export function presentEnrollmentStatus(status: EnrollmentStatus): StatusPresentation {
  return ENROLLMENT[status];
}

const GRADE: Record<GradeStatus, StatusPresentation> = {
  [GradeStatus.DRAFT]: { label: 'Draft', badge: 'neutral' },
  [GradeStatus.SUBMITTED]: { label: 'Submitted', badge: 'pending' },
  [GradeStatus.APPROVED]: { label: 'Approved', badge: 'active' },
  [GradeStatus.PUBLISHED]: { label: 'Published', badge: 'success' },
  [GradeStatus.LOCKED]: { label: 'Locked', badge: 'neutral' },
};

export function presentGradeStatus(status: GradeStatus, isPublished: boolean): StatusPresentation {
  if (isPublished || status === GradeStatus.PUBLISHED) {
    return { label: 'Published', badge: 'success' };
  }
  return GRADE[status];
}

const APPROVAL: Record<ApprovalStatus, StatusPresentation> = {
  [ApprovalStatus.APPROVED]: { label: 'Approved', badge: 'success' },
  [ApprovalStatus.PENDING]: { label: 'Pending', badge: 'pending' },
  [ApprovalStatus.UNDER_REVIEW]: { label: 'Under review', badge: 'pending' },
  [ApprovalStatus.REJECTED]: { label: 'Rejected', badge: 'error' },
};

export function presentApprovalStatus(status: ApprovalStatus): StatusPresentation {
  return APPROVAL[status];
}

export function presentSyncStatus(
  status: SyncStatus,
  lastSyncAt: string | null,
): StatusPresentation {
  if (status === 'syncing') return { label: 'Syncing…', badge: 'pending' };
  if (status === 'failed') return { label: 'Sync failed', badge: 'error' };
  return lastSyncAt
    ? { label: `Last synced ${formatIsoDateTime(lastSyncAt)}`, badge: 'neutral' }
    : { label: 'Not synced yet', badge: 'neutral' };
}

export function presentConnectivity(isOnline: boolean): StatusPresentation {
  return isOnline ? { label: 'Online', badge: 'success' } : { label: 'Offline', badge: 'pending' };
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src/presenters
git commit -m "feat(presentation): add status presenters with semantic badge tokens"
```

---

### Task 10: Shared stores (session, connectivity, dialogs, navigation) + shared selectors

**Files:**

- Create: `packages/presentation/src/stores/session-store.ts`
- Create: `packages/presentation/src/stores/connectivity-store.ts`
- Create: `packages/presentation/src/stores/dialog-store.ts`
- Create: `packages/presentation/src/navigation/route.ts`
- Create: `packages/presentation/src/stores/navigation-store.ts`
- Create: `packages/presentation/src/selectors/session-selectors.ts`
- Create: `packages/presentation/src/selectors/connectivity-selectors.ts`
- Test: `packages/presentation/src/stores/shared-stores.test.ts`

**Interfaces:**

- Consumes: `createStore`; `NotificationStore` (Task 4); `SyncStatus`, `presentSyncStatus`, `presentConnectivity`, `StatusPresentation` (Task 9).
- Produces:
  - `SessionState { currentUserId; selectedStudentId; selectedSchoolId; activeAcademicYearId; activeTermId; currentDeviceId }` (all `string | null`) and `class SessionStore { store; setCurrentUser(id); selectStudent(id); selectSchool(id); setActiveAcademicYear(yearId, termId?); setCurrentDevice(id) }`
  - `ConnectivityState { isOnline: boolean; syncStatus: SyncStatus; lastSyncAt: string | null }` and `class ConnectivityStore { store; setOnline(isOnline); setSyncStatus(status); markSyncCompleted(atIso) }` — constructor takes optional `NotificationStore`; transitions online→offline emit a warning notification, offline→online an info notification.
  - `ConfirmRequest { title; message; confirmLabel; cancelLabel }`, `DialogDescriptor = { kind: 'confirm'; payload: ConfirmRequest } | { kind: 'custom'; name: string; payload: unknown }`, `DialogState { current: DialogDescriptor | null }`, `class DialogStore { store; open(name, payload?); close(); confirm(request): Promise<boolean>; resolveConfirm(result) }`
  - `ScreenId = 'dashboard' | 'students' | 'class-roster' | 'attendance' | 'assessments' | 'settings' | 'device' | 'sync' | 'teachers'`, `RouteDescriptor { screen: ScreenId; params: Readonly<Record<string, string>> }`, `NavigationState { current; history: readonly RouteDescriptor[] }`, `class NavigationStore { store; navigate(screen, params?); back() }` — initial route `{ screen: 'dashboard', params: {} }`; `back()` is a no-op on empty history.
  - Selectors (pure fns): `selectCurrentUserId(s: SessionState)`, `selectSelectedStudentId(s)`, `selectActiveAcademicYearId(s)`, `selectCurrentDeviceId(s)`; `selectIsOffline(c: ConnectivityState)`, `selectSyncStatus(c)`, `selectSyncPresentation(c): StatusPresentation`, `selectConnectivityPresentation(c): StatusPresentation`.

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/stores/shared-stores.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  selectConnectivityPresentation,
  selectIsOffline,
  selectSyncPresentation,
} from '../selectors/connectivity-selectors';
import { selectCurrentUserId, selectSelectedStudentId } from '../selectors/session-selectors';
import { ConnectivityStore } from './connectivity-store';
import { DialogStore } from './dialog-store';
import { NavigationStore } from './navigation-store';
import { NotificationStore } from './notification-store';
import { SessionStore } from './session-store';

describe('SessionStore', () => {
  it('tracks selection state', () => {
    const session = new SessionStore();
    session.setCurrentUser('usr-1');
    session.selectStudent('stu-1');
    session.setActiveAcademicYear('ay-1', 'term-2');
    session.setCurrentDevice('dev-1');
    const state = session.store.getState();
    expect(selectCurrentUserId(state)).toBe('usr-1');
    expect(selectSelectedStudentId(state)).toBe('stu-1');
    expect(state.activeAcademicYearId).toBe('ay-1');
    expect(state.activeTermId).toBe('term-2');
    expect(state.currentDeviceId).toBe('dev-1');
    session.selectStudent(null);
    expect(session.store.getState().selectedStudentId).toBeNull();
  });
});

describe('ConnectivityStore', () => {
  it('notifies on connectivity transitions and tracks sync', () => {
    const notifications = new NotificationStore();
    const connectivity = new ConnectivityStore(notifications);
    connectivity.setOnline(false);
    connectivity.setOnline(false); // no duplicate notification
    connectivity.setOnline(true);
    const kinds = notifications.store.getState().notifications.map((n) => n.kind);
    expect(kinds).toEqual(['warning', 'info']);

    expect(selectIsOffline(connectivity.store.getState())).toBe(false);
    connectivity.setSyncStatus('syncing');
    expect(selectSyncPresentation(connectivity.store.getState()).label).toBe('Syncing…');
    connectivity.markSyncCompleted('2026-07-19T12:00:00.000Z');
    const state = connectivity.store.getState();
    expect(state.syncStatus).toBe('idle');
    expect(selectSyncPresentation(state).label).toBe('Last synced 19 Jul 2026, 12:00');
    expect(selectConnectivityPresentation(state).label).toBe('Online');
  });
});

describe('DialogStore', () => {
  it('opens custom dialogs and resolves confirms', async () => {
    const dialogs = new DialogStore();
    dialogs.open('link-guardian', { studentId: 'stu-1' });
    expect(dialogs.store.getState().current).toEqual({
      kind: 'custom',
      name: 'link-guardian',
      payload: { studentId: 'stu-1' },
    });
    dialogs.close();
    expect(dialogs.store.getState().current).toBeNull();

    const answer = dialogs.confirm({ message: 'Deactivate this student?' });
    const current = dialogs.store.getState().current;
    expect(current?.kind).toBe('confirm');
    if (current?.kind === 'confirm') expect(current.payload.confirmLabel).toBe('Confirm');
    dialogs.resolveConfirm(true);
    await expect(answer).resolves.toBe(true);
    expect(dialogs.store.getState().current).toBeNull();
  });

  it('close resolves a pending confirm as false', async () => {
    const dialogs = new DialogStore();
    const answer = dialogs.confirm({ message: 'Sure?' });
    dialogs.close();
    await expect(answer).resolves.toBe(false);
  });
});

describe('NavigationStore', () => {
  it('starts on dashboard, navigates, and goes back', () => {
    const nav = new NavigationStore();
    expect(nav.store.getState().current).toEqual({ screen: 'dashboard', params: {} });
    nav.navigate('students');
    nav.navigate('class-roster', { classId: 'cls-1' });
    expect(nav.store.getState().current.params['classId']).toBe('cls-1');
    nav.back();
    expect(nav.store.getState().current.screen).toBe('students');
    nav.back();
    nav.back(); // extra back is a no-op
    expect(nav.store.getState().current.screen).toBe('dashboard');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/stores/session-store.ts`:

```ts
import { createStore } from 'zustand/vanilla';

/** Cross-screen selection/session state so every screen agrees on what is
 * selected. Screen-specific state stays in each ViewModel's store. */
export interface SessionState {
  readonly currentUserId: string | null;
  readonly selectedStudentId: string | null;
  readonly selectedSchoolId: string | null;
  readonly activeAcademicYearId: string | null;
  readonly activeTermId: string | null;
  readonly currentDeviceId: string | null;
}

export class SessionStore {
  readonly store = createStore<SessionState>(() => ({
    currentUserId: null,
    selectedStudentId: null,
    selectedSchoolId: null,
    activeAcademicYearId: null,
    activeTermId: null,
    currentDeviceId: null,
  }));

  setCurrentUser(currentUserId: string | null): void {
    this.store.setState({ currentUserId });
  }
  selectStudent(selectedStudentId: string | null): void {
    this.store.setState({ selectedStudentId });
  }
  selectSchool(selectedSchoolId: string | null): void {
    this.store.setState({ selectedSchoolId });
  }
  setActiveAcademicYear(activeAcademicYearId: string | null, activeTermId?: string | null): void {
    this.store.setState({ activeAcademicYearId, activeTermId: activeTermId ?? null });
  }
  setCurrentDevice(currentDeviceId: string | null): void {
    this.store.setState({ currentDeviceId });
  }
}
```

`packages/presentation/src/stores/connectivity-store.ts`:

```ts
import { createStore } from 'zustand/vanilla';
import type { SyncStatus } from '../presenters/status-presentation';
import type { NotificationStore } from './notification-store';

export interface ConnectivityState {
  readonly isOnline: boolean;
  readonly syncStatus: SyncStatus;
  readonly lastSyncAt: string | null;
}

/** Written by future sync/IPC phases; read by every screen via selectors.
 * State-only today — no actual networking or sync in the presentation layer. */
export class ConnectivityStore {
  readonly store = createStore<ConnectivityState>(() => ({
    isOnline: true,
    syncStatus: 'idle',
    lastSyncAt: null,
  }));

  constructor(private readonly notifications?: NotificationStore) {}

  setOnline(isOnline: boolean): void {
    const was = this.store.getState().isOnline;
    if (was === isOnline) return;
    this.store.setState({ isOnline });
    if (!isOnline) {
      this.notifications?.warning(
        'You are offline. Your work is saved locally and will sync when the connection returns.',
      );
    } else {
      this.notifications?.info('Back online.');
    }
  }

  setSyncStatus(syncStatus: SyncStatus): void {
    this.store.setState({ syncStatus });
  }

  markSyncCompleted(atIso: string): void {
    this.store.setState({ syncStatus: 'idle', lastSyncAt: atIso });
  }
}
```

`packages/presentation/src/stores/dialog-store.ts`:

```ts
import { createStore } from 'zustand/vanilla';

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

export type DialogDescriptor =
  | { readonly kind: 'confirm'; readonly payload: ConfirmRequest }
  | { readonly kind: 'custom'; readonly name: string; readonly payload: unknown };

export interface DialogState {
  readonly current: DialogDescriptor | null;
}

export class DialogStore {
  readonly store = createStore<DialogState>(() => ({ current: null }));
  private pendingConfirm: ((result: boolean) => void) | null = null;

  open(name: string, payload?: unknown): void {
    // Opening any dialog cancels a pending confirm so its awaiter never orphans.
    this.pendingConfirm?.(false);
    this.pendingConfirm = null;
    this.store.setState({ current: { kind: 'custom', name, payload } });
  }

  /** Promise-based confirmation; the UI renders `current` and calls
   * resolveConfirm with the user's answer. */
  confirm(request: {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }): Promise<boolean> {
    this.pendingConfirm?.(false);
    const payload: ConfirmRequest = {
      title: request.title ?? 'Are you sure?',
      message: request.message,
      confirmLabel: request.confirmLabel ?? 'Confirm',
      cancelLabel: request.cancelLabel ?? 'Cancel',
    };
    this.store.setState({ current: { kind: 'confirm', payload } });
    return new Promise<boolean>((resolve) => {
      this.pendingConfirm = resolve;
    });
  }

  resolveConfirm(result: boolean): void {
    const resolve = this.pendingConfirm;
    this.pendingConfirm = null;
    this.store.setState({ current: null });
    resolve?.(result);
  }

  close(): void {
    if (this.pendingConfirm) {
      this.resolveConfirm(false);
      return;
    }
    this.store.setState({ current: null });
  }
}
```

`packages/presentation/src/navigation/route.ts`:

```ts
/** Known screens. Extension-point screens are listed so navigation is typed
 * end-to-end before their ViewModels are implemented. */
export type ScreenId =
  | 'dashboard'
  | 'students'
  | 'class-roster'
  | 'attendance'
  | 'assessments'
  | 'settings'
  | 'device'
  | 'sync'
  | 'teachers';

export interface RouteDescriptor {
  readonly screen: ScreenId;
  readonly params: Readonly<Record<string, string>>;
}
```

`packages/presentation/src/stores/navigation-store.ts`:

```ts
import { createStore } from 'zustand/vanilla';
import type { RouteDescriptor, ScreenId } from '../navigation/route';

/** Framework-agnostic navigation source of truth; the real router (Next.js,
 * Phase 7) mirrors this store. */
export interface NavigationState {
  readonly current: RouteDescriptor;
  readonly history: readonly RouteDescriptor[];
}

export class NavigationStore {
  readonly store = createStore<NavigationState>(() => ({
    current: { screen: 'dashboard', params: {} },
    history: [],
  }));

  navigate(screen: ScreenId, params: Readonly<Record<string, string>> = {}): void {
    this.store.setState((s) => ({
      current: { screen, params },
      history: [...s.history, s.current],
    }));
  }

  back(): void {
    this.store.setState((s) => {
      const previous = s.history[s.history.length - 1];
      if (!previous) return s;
      return { current: previous, history: s.history.slice(0, -1) };
    });
  }
}
```

`packages/presentation/src/selectors/session-selectors.ts`:

```ts
import type { SessionState } from '../stores/session-store';

export function selectCurrentUserId(state: SessionState): string | null {
  return state.currentUserId;
}
export function selectSelectedStudentId(state: SessionState): string | null {
  return state.selectedStudentId;
}
export function selectActiveAcademicYearId(state: SessionState): string | null {
  return state.activeAcademicYearId;
}
export function selectCurrentDeviceId(state: SessionState): string | null {
  return state.currentDeviceId;
}
```

`packages/presentation/src/selectors/connectivity-selectors.ts`:

```ts
import { presentConnectivity, presentSyncStatus } from '../presenters/present-status';
import type { StatusPresentation, SyncStatus } from '../presenters/status-presentation';
import type { ConnectivityState } from '../stores/connectivity-store';

export function selectIsOffline(state: ConnectivityState): boolean {
  return !state.isOnline;
}
export function selectSyncStatus(state: ConnectivityState): SyncStatus {
  return state.syncStatus;
}
export function selectSyncPresentation(state: ConnectivityState): StatusPresentation {
  return presentSyncStatus(state.syncStatus, state.lastSyncAt);
}
export function selectConnectivityPresentation(state: ConnectivityState): StatusPresentation {
  return presentConnectivity(state.isOnline);
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src
git commit -m "feat(presentation): add session/connectivity/dialog/navigation stores and shared selectors"
```

---

### Task 11: Test helper — real application layer over in-memory fakes

**Files:**

- Create: `packages/presentation/src/testing/create-test-application.ts`
- Test: `packages/presentation/src/testing/create-test-application.test.ts`

**Interfaces:**

- Consumes: `createApplicationLayer`, `ApplicationLayer`, and the Phase-5 testing exports from `@nemis-desktop/application`: `InMemoryStudentRepository`, `InMemoryGuardianRepository`, `InMemoryEnrollmentRepository`, `InMemoryClassRepository`, `InMemoryAttendanceRepository`, `InMemoryAssessmentRepository`, `InMemoryGradeRepository`, `InMemoryUserRepository`, `InMemoryInstitutionRepository`, `InMemoryGradingConfigRepository`, `InMemoryDeviceGateway`, `InMemorySettingsGateway`, `PassthroughUnitOfWork`, `FixedClock`, `SequentialIdGenerator`, `CollectingEventPublisher`, `RecordingLogger`.
- Produces: `TestPorts` (the concrete fake types, so tests can reach `.store` maps for seeding) and `createTestApplication(): { app: ApplicationLayer; ports: TestPorts }`. ViewModel tests use this — real presentation→application integration, no SQLite, no mocks of our own code.

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/testing/create-test-application.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { createTestApplication } from './create-test-application';

describe('createTestApplication', () => {
  it('wires a working application layer over in-memory fakes', async () => {
    const { app, ports } = createTestApplication();
    const created = await app.students.create({
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
    });
    expect(created.data.id).toBe('id-1'); // SequentialIdGenerator
    expect(created.data.fullName).toBe('Ada Lovelace');
    expect(ports.students.store.size).toBe(1);
    const listed = await app.students.list({ limit: 10, offset: 0 });
    expect(listed.data.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/testing/create-test-application.ts`:

```ts
import {
  CollectingEventPublisher,
  FixedClock,
  InMemoryAssessmentRepository,
  InMemoryAttendanceRepository,
  InMemoryClassRepository,
  InMemoryDeviceGateway,
  InMemoryEnrollmentRepository,
  InMemoryGradeRepository,
  InMemoryGradingConfigRepository,
  InMemoryGuardianRepository,
  InMemoryInstitutionRepository,
  InMemorySettingsGateway,
  InMemoryStudentRepository,
  InMemoryUserRepository,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
  createApplicationLayer,
  type ApplicationLayer,
} from '@nemis-desktop/application';

/** Concrete fake types so tests can seed via the exposed `.store` maps. */
export interface TestPorts {
  students: InMemoryStudentRepository;
  guardians: InMemoryGuardianRepository;
  enrollments: InMemoryEnrollmentRepository;
  classes: InMemoryClassRepository;
  attendance: InMemoryAttendanceRepository;
  assessments: InMemoryAssessmentRepository;
  grades: InMemoryGradeRepository;
  users: InMemoryUserRepository;
  institutions: InMemoryInstitutionRepository;
  gradingConfigs: InMemoryGradingConfigRepository;
  deviceGateway: InMemoryDeviceGateway;
  settingsGateway: InMemorySettingsGateway;
  unitOfWork: PassthroughUnitOfWork;
  clock: FixedClock;
  ids: SequentialIdGenerator;
  events: CollectingEventPublisher;
  logger: RecordingLogger;
}

/** Builds the REAL Phase-5 application layer over in-memory fakes so
 * presentation tests exercise the full presentation→application path
 * without SQLite. */
export function createTestApplication(): { app: ApplicationLayer; ports: TestPorts } {
  const ports: TestPorts = {
    students: new InMemoryStudentRepository(),
    guardians: new InMemoryGuardianRepository(),
    enrollments: new InMemoryEnrollmentRepository(),
    classes: new InMemoryClassRepository(),
    attendance: new InMemoryAttendanceRepository(),
    assessments: new InMemoryAssessmentRepository(),
    grades: new InMemoryGradeRepository(),
    users: new InMemoryUserRepository(),
    institutions: new InMemoryInstitutionRepository(),
    gradingConfigs: new InMemoryGradingConfigRepository(),
    deviceGateway: new InMemoryDeviceGateway(),
    settingsGateway: new InMemorySettingsGateway(),
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-19T12:00:00.000Z'),
    ids: new SequentialIdGenerator(),
    events: new CollectingEventPublisher(),
    logger: new RecordingLogger(),
  };
  return { app: createApplicationLayer(ports), ports };
}
```

(If any fake's constructor differs, check `packages/application/src/testing/` — the class names above are the Phase-5 exports; all are no-arg except `FixedClock(iso)` and optional-prefix `SequentialIdGenerator`.)

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src/testing
git commit -m "test(presentation): add createTestApplication helper over in-memory fakes"
```

---

### Task 12: Students slice (views, mapper, commands, queries, ViewModel, selectors)

**Files:**

- Create: `packages/presentation/src/view-models/students/students-views.ts`
- Create: `packages/presentation/src/mappers/students/student-view-mapper.ts`
- Create: `packages/presentation/src/commands/students/students-command-deps.ts`
- Create: `packages/presentation/src/commands/students/create-student-ui-command.ts`
- Create: `packages/presentation/src/commands/students/deactivate-student-ui-command.ts`
- Create: `packages/presentation/src/commands/students/link-guardian-ui-command.ts`
- Create: `packages/presentation/src/queries/students/list-students-ui-query.ts`
- Create: `packages/presentation/src/queries/students/get-student-by-id-ui-query.ts`
- Create: `packages/presentation/src/view-models/students/students-view-model.ts`
- Create: `packages/presentation/src/selectors/students-selectors.ts`
- Test: `packages/presentation/src/view-models/students/students-view-model.test.ts`

**Interfaces:**

- Consumes: `StudentApplicationService` (`create/deactivate/linkGuardian/getById/list`), DTOs `CreateStudentDto`, `DeactivateStudentDto`, `LinkGuardianDto`, `StudentOutput`, `StudentSummaryOutput`, `PagedResult`, `PageRequest`, `ApplicationResponse` from `@nemis-desktop/application`; Tasks 2–10 building blocks; `SessionStore`; `createTestApplication` (Task 11).
- Produces:
  - `StudentRowView { id; fullName; admissionNumber; gradeLevel: string; status: StatusPresentation }`
  - `StudentDetailsView { id; institutionId; fullName; admissionNumber; dateOfBirth: string; gender: string; gradeLevel: string; status: StatusPresentation; guardianCount: number; updatedAt: string }`
  - `toStudentRowView(dto: StudentSummaryOutput): StudentRowView`, `toStudentDetailsView(dto: StudentOutput): StudentDetailsView`
  - `StudentsCommandDeps { students: StudentApplicationService; notifications: NotificationStore }`
  - `CreateStudentUiCommand.execute(dto: CreateStudentDto): Promise<CommandOutcome<StudentDetailsView>>` (and Deactivate/LinkGuardian equivalents)
  - `ListStudentsUiQuery.execute(page: PageRequest)`, `GetStudentByIdUiQuery.execute(studentId: string)`
  - `StudentsState { list: AsyncState<readonly StudentRowView[]>; details: AsyncState<StudentDetailsView>; pagination: PaginationState; search: SearchState; submission: SubmissionStatus }`
  - `class StudentsViewModel { store; loadStudents(); goToPage(page); setPageSize(size); setKeyword(kw); selectStudent(id | null); loadDetails(id); createStudent(dto); deactivateStudent(dto); linkGuardian(dto) }` with deps `{ students; notifications; session }`
  - selectors: `selectStudentRows(state)`, `selectStudentsViewStatus(state, connectivity)`, `selectSelectedStudent(session, students)`

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/view-models/students/students-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { ValidationError } from '../../errors';
import { selectSelectedStudent, selectStudentRows } from '../../selectors/students-selectors';
import { NotificationStore } from '../../stores/notification-store';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { StudentsViewModel } from './students-view-model';

const dto = {
  institutionId: 'inst-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  admissionNumber: 'ADM-001',
  dateOfBirth: '2015-06-01',
  gender: Gender.FEMALE,
} as const;

function build() {
  const { app, ports } = createTestApplication();
  const notifications = new NotificationStore();
  const session = new SessionStore();
  const vm = new StudentsViewModel({ students: app.students, notifications, session });
  return { app, ports, notifications, session, vm };
}

describe('StudentsViewModel', () => {
  it('loads a page of students with formatted rows and total count', async () => {
    const { app, vm } = build();
    await app.students.create(dto);
    await app.students.create({ ...dto, firstName: 'Grace', admissionNumber: 'ADM-002' });
    await vm.loadStudents();
    const state = vm.store.getState();
    expect(state.list.status).toBe('success');
    expect(state.pagination.totalCount).toBe(2);
    const rows = selectStudentRows(state);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status.label).toBe('Active');
    expect(rows[0]?.gradeLevel).toBe('—'); // no gradeLevel in dto
  });

  it('reports empty when no students exist', async () => {
    const { vm } = build();
    await vm.loadStudents();
    expect(vm.store.getState().list.status).toBe('empty');
  });

  it('filters rows by keyword via the selector', async () => {
    const { app, vm } = build();
    await app.students.create(dto);
    await app.students.create({ ...dto, firstName: 'Grace', admissionNumber: 'ADM-002' });
    await vm.loadStudents();
    vm.setKeyword('grace');
    const rows = selectStudentRows(vm.store.getState());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fullName).toBe('Grace Lovelace');
  });

  it('createStudent succeeds, notifies, and refreshes the list', async () => {
    const { vm, notifications } = build();
    const outcome = await vm.createStudent(dto);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.data.fullName).toBe('Ada Lovelace');
    expect(vm.store.getState().submission).toBe('submitted');
    expect(vm.store.getState().list.status).toBe('success');
    expect(notifications.store.getState().notifications[0]?.kind).toBe('success');
  });

  it('createStudent with a missing required field fails with ValidationError', async () => {
    const { vm, notifications } = build();
    const outcome = await vm.createStudent({
      ...dto,
      firstName: undefined as unknown as string,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBeInstanceOf(ValidationError);
    expect(vm.store.getState().submission).toBe('failed');
    expect(notifications.store.getState().notifications[0]?.kind).toBe('error');
  });

  it('selectStudent stores the selection and loads formatted details', async () => {
    const { app, vm, session } = build();
    const created = await app.students.create(dto);
    await vm.loadStudents();
    await vm.selectStudent(created.data.id);
    expect(session.store.getState().selectedStudentId).toBe(created.data.id);
    const details = vm.store.getState().details;
    expect(details.status).toBe('success');
    if (details.status === 'success') {
      expect(details.data.dateOfBirth).toBe('01 Jun 2015');
      expect(details.data.gender).toBe('Female');
      expect(details.data.guardianCount).toBe(0);
    }
    expect(selectSelectedStudent(session.store.getState(), vm.store.getState())?.id).toBe(
      created.data.id,
    );
    await vm.selectStudent(null);
    expect(vm.store.getState().details.status).toBe('idle');
  });

  it('deactivateStudent updates the open details and list row status', async () => {
    const { app, vm } = build();
    const created = await app.students.create(dto);
    await vm.loadStudents();
    await vm.selectStudent(created.data.id); // open this student's details
    const outcome = await vm.deactivateStudent({ studentId: created.data.id, actorId: 'usr-1' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.data.status.label).toBe('Inactive');
    const details = vm.store.getState().details;
    expect(details.status).toBe('success');
    if (details.status === 'success') expect(details.data.status.label).toBe('Inactive');
    const rows = selectStudentRows(vm.store.getState());
    expect(rows[0]?.status.label).toBe('Inactive');
  });

  it('deactivateStudent does not clobber details for a different open student', async () => {
    const { app, vm } = build();
    const a = await app.students.create(dto);
    const b = await app.students.create({ ...dto, firstName: 'Grace', admissionNumber: 'ADM-002' });
    await vm.selectStudent(a.data.id); // details shows A
    await vm.deactivateStudent({ studentId: b.data.id, actorId: 'usr-1' });
    const details = vm.store.getState().details;
    expect(details.status).toBe('success');
    if (details.status === 'success') {
      expect(details.data.id).toBe(a.data.id);
      expect(details.data.status.label).toBe('Active'); // A untouched
    }
  });

  it('linkGuardian surfaces a business failure as an error notification', async () => {
    const { app, vm, notifications } = build();
    const created = await app.students.create(dto);
    const outcome = await vm.linkGuardian({
      studentId: created.data.id,
      guardianId: 'missing-guardian',
      isPrimary: true,
      actorId: 'usr-1',
    });
    expect(outcome.ok).toBe(false);
    expect(notifications.store.getState().notifications[0]?.kind).toBe('error');
    expect(vm.store.getState().submission).toBe('failed');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/view-models/students/students-views.ts`:

```ts
import type { StatusPresentation } from '../../presenters/status-presentation';

export interface StudentRowView {
  readonly id: string;
  readonly fullName: string;
  readonly admissionNumber: string;
  readonly gradeLevel: string;
  readonly status: StatusPresentation;
}

export interface StudentDetailsView {
  readonly id: string;
  readonly institutionId: string;
  readonly fullName: string;
  readonly admissionNumber: string;
  readonly dateOfBirth: string;
  readonly gender: string;
  readonly gradeLevel: string;
  readonly status: StatusPresentation;
  readonly guardianCount: number;
  readonly updatedAt: string;
}
```

`packages/presentation/src/mappers/students/student-view-mapper.ts`:

```ts
import type { StudentOutput, StudentSummaryOutput } from '@nemis-desktop/application';
import { formatIsoDate, formatIsoDateTime } from '../../formatters/format-date';
import { formatGradeLevel, humanizeEnum } from '../../formatters/format-text';
import { presentActive } from '../../presenters/present-status';
import type { StudentDetailsView, StudentRowView } from '../../view-models/students/students-views';

export function toStudentRowView(dto: StudentSummaryOutput): StudentRowView {
  return {
    id: dto.id,
    fullName: dto.fullName,
    admissionNumber: dto.admissionNumber,
    gradeLevel: formatGradeLevel(dto.gradeLevel),
    status: presentActive(dto.isActive),
  };
}

export function toStudentDetailsView(dto: StudentOutput): StudentDetailsView {
  return {
    id: dto.id,
    institutionId: dto.institutionId,
    fullName: dto.fullName,
    admissionNumber: dto.admissionNumber,
    dateOfBirth: formatIsoDate(dto.dateOfBirth),
    gender: humanizeEnum(dto.gender),
    gradeLevel: formatGradeLevel(dto.gradeLevel),
    status: presentActive(dto.isActive),
    guardianCount: dto.guardians.length,
    updatedAt: formatIsoDateTime(dto.updatedAt),
  };
}
```

`packages/presentation/src/commands/students/students-command-deps.ts`:

```ts
import type { StudentApplicationService } from '@nemis-desktop/application';
import type { NotificationStore } from '../../stores/notification-store';

export interface StudentsCommandDeps {
  readonly students: StudentApplicationService;
  readonly notifications: NotificationStore;
}
```

`packages/presentation/src/commands/students/create-student-ui-command.ts`:

```ts
import type { CreateStudentDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toStudentDetailsView } from '../../mappers/students/student-view-mapper';
import type { StudentDetailsView } from '../../view-models/students/students-views';
import type { StudentsCommandDeps } from './students-command-deps';

export class CreateStudentUiCommand {
  constructor(private readonly deps: StudentsCommandDeps) {}

  execute(dto: CreateStudentDto): Promise<CommandOutcome<StudentDetailsView>> {
    return executeCommand({
      run: () => this.deps.students.create(dto),
      map: toStudentDetailsView,
      notifications: this.deps.notifications,
      successMessage: 'Student created.',
    });
  }
}
```

`packages/presentation/src/commands/students/deactivate-student-ui-command.ts`:

```ts
import type { DeactivateStudentDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toStudentDetailsView } from '../../mappers/students/student-view-mapper';
import type { StudentDetailsView } from '../../view-models/students/students-views';
import type { StudentsCommandDeps } from './students-command-deps';

export class DeactivateStudentUiCommand {
  constructor(private readonly deps: StudentsCommandDeps) {}

  execute(dto: DeactivateStudentDto): Promise<CommandOutcome<StudentDetailsView>> {
    return executeCommand({
      run: () => this.deps.students.deactivate(dto),
      map: toStudentDetailsView,
      notifications: this.deps.notifications,
      successMessage: 'Student deactivated.',
    });
  }
}
```

`packages/presentation/src/commands/students/link-guardian-ui-command.ts`:

```ts
import type { LinkGuardianDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toStudentDetailsView } from '../../mappers/students/student-view-mapper';
import type { StudentDetailsView } from '../../view-models/students/students-views';
import type { StudentsCommandDeps } from './students-command-deps';

export class LinkGuardianUiCommand {
  constructor(private readonly deps: StudentsCommandDeps) {}

  execute(dto: LinkGuardianDto): Promise<CommandOutcome<StudentDetailsView>> {
    return executeCommand({
      run: () => this.deps.students.linkGuardian(dto),
      map: toStudentDetailsView,
      notifications: this.deps.notifications,
      successMessage: 'Guardian linked.',
    });
  }
}
```

`packages/presentation/src/queries/students/list-students-ui-query.ts`:

```ts
import type {
  ApplicationResponse,
  PagedResult,
  PageRequest,
  StudentApplicationService,
  StudentSummaryOutput,
} from '@nemis-desktop/application';

/** Read model for the students list. Grows presentation-side shaping (server
 * search, projection) without touching ViewModels. */
export class ListStudentsUiQuery {
  constructor(private readonly students: StudentApplicationService) {}

  execute(page: PageRequest): Promise<ApplicationResponse<PagedResult<StudentSummaryOutput>>> {
    return this.students.list(page);
  }
}
```

`packages/presentation/src/queries/students/get-student-by-id-ui-query.ts`:

```ts
import type {
  ApplicationResponse,
  StudentApplicationService,
  StudentOutput,
} from '@nemis-desktop/application';

export class GetStudentByIdUiQuery {
  constructor(private readonly students: StudentApplicationService) {}

  execute(studentId: string): Promise<ApplicationResponse<StudentOutput | null>> {
    return this.students.getById({ studentId });
  }
}
```

`packages/presentation/src/view-models/students/students-view-model.ts`:

```ts
import type {
  CreateStudentDto,
  DeactivateStudentDto,
  LinkGuardianDto,
  StudentApplicationService,
} from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { hasData, idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { CreateStudentUiCommand } from '../../commands/students/create-student-ui-command';
import { DeactivateStudentUiCommand } from '../../commands/students/deactivate-student-ui-command';
import { LinkGuardianUiCommand } from '../../commands/students/link-guardian-ui-command';
import { toStudentDetailsView, toStudentRowView } from '../../mappers/students/student-view-mapper';
import {
  createPagination,
  toPageRequest,
  withPage,
  withPageSize,
  withTotal,
  type PaginationState,
} from '../../pagination/pagination';
import { GetStudentByIdUiQuery } from '../../queries/students/get-student-by-id-ui-query';
import { ListStudentsUiQuery } from '../../queries/students/list-students-ui-query';
import { createSearch, withKeyword, type SearchState } from '../../search/search-state';
import type { NotificationStore } from '../../stores/notification-store';
import type { SessionStore } from '../../stores/session-store';
import type { StudentDetailsView, StudentRowView } from './students-views';

export interface StudentsState {
  readonly list: AsyncState<readonly StudentRowView[]>;
  readonly details: AsyncState<StudentDetailsView>;
  readonly pagination: PaginationState;
  readonly search: SearchState;
  readonly submission: SubmissionStatus;
}

export interface StudentsViewModelDeps {
  readonly students: StudentApplicationService;
  readonly notifications: NotificationStore;
  readonly session: SessionStore;
}

export class StudentsViewModel {
  readonly store = createStore<StudentsState>(() => ({
    list: idleState(),
    details: idleState(),
    pagination: createPagination(),
    search: createSearch(),
    submission: 'idle',
  }));

  private readonly listQuery: ListStudentsUiQuery;
  private readonly detailsQuery: GetStudentByIdUiQuery;
  private readonly createCommand: CreateStudentUiCommand;
  private readonly deactivateCommand: DeactivateStudentUiCommand;
  private readonly linkGuardianCommand: LinkGuardianUiCommand;

  constructor(private readonly deps: StudentsViewModelDeps) {
    const commandDeps = { students: deps.students, notifications: deps.notifications };
    this.listQuery = new ListStudentsUiQuery(deps.students);
    this.detailsQuery = new GetStudentByIdUiQuery(deps.students);
    this.createCommand = new CreateStudentUiCommand(commandDeps);
    this.deactivateCommand = new DeactivateStudentUiCommand(commandDeps);
    this.linkGuardianCommand = new LinkGuardianUiCommand(commandDeps);
  }

  async loadStudents(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().list,
        set: (list) => this.store.setState({ list }),
      },
      fetch: () => this.listQuery.execute(toPageRequest(this.store.getState().pagination)),
      onData: (page) =>
        this.store.setState((s) => ({ pagination: withTotal(s.pagination, page.total) })),
      map: (page) => page.items.map(toStudentRowView),
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async goToPage(page: number): Promise<void> {
    this.store.setState((s) => ({ pagination: withPage(s.pagination, page) }));
    await this.loadStudents();
  }

  async setPageSize(pageSize: number): Promise<void> {
    this.store.setState((s) => ({ pagination: withPageSize(s.pagination, pageSize) }));
    await this.loadStudents();
  }

  setKeyword(keyword: string): void {
    this.store.setState((s) => ({ search: withKeyword(s.search, keyword) }));
  }

  async selectStudent(studentId: string | null): Promise<void> {
    this.deps.session.selectStudent(studentId);
    if (studentId === null) {
      this.store.setState({ details: idleState() });
      return;
    }
    await this.loadDetails(studentId);
  }

  async loadDetails(studentId: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().details,
        set: (details) => this.store.setState({ details }),
      },
      fetch: () => this.detailsQuery.execute(studentId),
      map: toStudentDetailsView,
    });
  }

  async createStudent(dto: CreateStudentDto): Promise<CommandOutcome<StudentDetailsView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.createCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadStudents();
    return outcome;
  }

  async deactivateStudent(dto: DeactivateStudentDto): Promise<CommandOutcome<StudentDetailsView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.deactivateCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.updateDetailsIfCurrent(outcome.data);
      await this.loadStudents();
    }
    return outcome;
  }

  async linkGuardian(dto: LinkGuardianDto): Promise<CommandOutcome<StudentDetailsView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.linkGuardianCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.updateDetailsIfCurrent(outcome.data);
    }
    return outcome;
  }

  /** Refresh the open details panel only when it is showing the mutated
   * student — never clobber a different student's open details. */
  private updateDetailsIfCurrent(view: StudentDetailsView): void {
    const details = this.store.getState().details;
    if (hasData(details) && details.data.id === view.id) {
      this.store.setState({ details: { status: 'success', data: view } });
    }
  }
}
```

`packages/presentation/src/selectors/students-selectors.ts`:

```ts
import { hasData, toViewStatus, type ViewStatus } from '../core/async-state';
import { matchesKeyword } from '../search/search-state';
import type { ConnectivityState } from '../stores/connectivity-store';
import type { SessionState } from '../stores/session-store';
import type { StudentsState } from '../view-models/students/students-view-model';
import type { StudentRowView } from '../view-models/students/students-views';

/** Rows for the students table with the client-side keyword filter applied. */
export function selectStudentRows(state: StudentsState): readonly StudentRowView[] {
  if (!hasData(state.list)) return [];
  return state.list.data.filter((row) =>
    matchesKeyword([row.fullName, row.admissionNumber], state.search.keyword),
  );
}

export function selectStudentsViewStatus(
  state: StudentsState,
  connectivity: ConnectivityState,
): ViewStatus {
  return toViewStatus(state.list, {
    isOffline: !connectivity.isOnline,
    isSyncing: connectivity.syncStatus === 'syncing',
  });
}

export function selectSelectedStudent(
  session: SessionState,
  students: StudentsState,
): StudentRowView | null {
  if (!session.selectedStudentId || !hasData(students.list)) return null;
  return students.list.data.find((row) => row.id === session.selectedStudentId) ?? null;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS. Also run `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src
git commit -m "feat(presentation): add Students slice (ViewModel, commands, queries, selectors)"
```

---

### Task 13: ClassRoster + Attendance slices

**Files:**

- Create: `packages/presentation/src/view-models/class-roster/class-roster-views.ts`
- Create: `packages/presentation/src/mappers/academics/enrollment-view-mapper.ts`
- Create: `packages/presentation/src/commands/academics/enroll-student-ui-command.ts`
- Create: `packages/presentation/src/commands/academics/withdraw-enrollment-ui-command.ts`
- Create: `packages/presentation/src/queries/academics/get-class-roster-ui-query.ts`
- Create: `packages/presentation/src/view-models/class-roster/class-roster-view-model.ts`
- Create: `packages/presentation/src/view-models/attendance/attendance-views.ts`
- Create: `packages/presentation/src/mappers/attendance/attendance-view-mapper.ts`
- Create: `packages/presentation/src/commands/attendance/record-attendance-ui-command.ts`
- Create: `packages/presentation/src/queries/attendance/get-attendance-ui-query.ts`
- Create: `packages/presentation/src/view-models/attendance/attendance-view-model.ts`
- Test: `packages/presentation/src/view-models/class-roster/class-roster-view-model.test.ts`
- Test: `packages/presentation/src/view-models/attendance/attendance-view-model.test.ts`

**Interfaces:**

- Consumes: `AcademicsApplicationService` (`enroll/withdraw/getClassRoster`), `AttendanceApplicationService` (`record/getByClassAndDate`), DTOs `EnrollStudentDto`, `WithdrawEnrollmentDto`, `EnrollmentOutput`, `ClassRosterOutput`, `RecordAttendanceDto`, `AttendanceOutput`; `EnrollmentStatus` from `@nemis-desktop/types`; Tasks 2–11 building blocks.
- Produces:
  - `EnrollmentRowView { id; studentId; classId; status: StatusPresentation; updatedAt: string }`, `ClassRosterView { classId; enrollments: readonly EnrollmentRowView[]; activeCount: number }`, `toEnrollmentRowView`, `toClassRosterView`
  - `EnrollStudentUiCommand` / `WithdrawEnrollmentUiCommand` → `CommandOutcome<EnrollmentRowView>`; `GetClassRosterUiQuery.execute(classId)`
  - `ClassRosterState { classId: string | null; roster: AsyncState<ClassRosterView>; submission: SubmissionStatus }`, `class ClassRosterViewModel { store; loadRoster(classId); enrollStudent(dto); withdrawEnrollment(dto) }` with deps `{ academics: AcademicsApplicationService; notifications: NotificationStore }`
  - `AttendanceRowView { id; studentId; date: string; status: StatusPresentation }`, `toAttendanceRowView`
  - `RecordAttendanceUiCommand` → `CommandOutcome<AttendanceRowView>`; `GetAttendanceUiQuery.execute(dto: { classId; date })`
  - `AttendanceState { classId: string | null; date: string | null; records: AsyncState<readonly AttendanceRowView[]>; submission: SubmissionStatus }`, `class AttendanceViewModel { store; loadAttendance(classId, date); recordAttendance(dto) }` with deps `{ attendance: AttendanceApplicationService; notifications: NotificationStore }`

- [ ] **Step 1: Write the failing tests**

`packages/presentation/src/view-models/class-roster/class-roster-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Class } from '@nemis-desktop/domain';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { ClassRosterViewModel } from './class-roster-view-model';

async function build() {
  const { app, ports } = createTestApplication();
  ports.classes.store.set(
    'cls-1',
    Class.reconstitute({
      id: 'cls-1',
      institutionId: 'inst-1',
      academicYearId: 'ay-1',
      name: 'Grade 1 A',
      gradeLevel: GradeLevel.GRADE_1,
      isActive: true,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const student = await app.students.create({
    institutionId: 'inst-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    admissionNumber: 'ADM-001',
    dateOfBirth: '2015-06-01',
    gender: Gender.FEMALE,
  });
  const notifications = new NotificationStore();
  const vm = new ClassRosterViewModel({ academics: app.academics, notifications });
  return { app, vm, notifications, studentId: student.data.id };
}

const enrollDto = (studentId: string) => ({
  studentId,
  classId: 'cls-1',
  academicYearId: 'ay-1',
  termId: 'term-1',
});

describe('ClassRosterViewModel', () => {
  it('shows an empty roster, then an active enrollment after enrolling', async () => {
    const { vm, studentId } = await build();
    await vm.loadRoster('cls-1');
    expect(vm.store.getState().roster.status).toBe('empty');

    const outcome = await vm.enrollStudent(enrollDto(studentId));
    expect(outcome.ok).toBe(true);
    const roster = vm.store.getState().roster;
    expect(roster.status).toBe('success');
    if (roster.status === 'success') {
      expect(roster.data.activeCount).toBe(1);
      expect(roster.data.enrollments[0]?.status.label).toBe('Active');
    }
  });

  it('withdrawEnrollment refreshes the roster with the withdrawn status', async () => {
    const { vm, studentId } = await build();
    const enrolled = await vm.enrollStudent(enrollDto(studentId));
    if (!enrolled.ok) throw new Error('enroll failed');
    const outcome = await vm.withdrawEnrollment({
      enrollmentId: enrolled.data.id,
      actorId: 'usr-1',
    });
    expect(outcome.ok).toBe(true);
    const roster = vm.store.getState().roster;
    if (roster.status === 'success') {
      expect(roster.data.activeCount).toBe(0);
      expect(roster.data.enrollments[0]?.status.label).toBe('Withdrawn');
    } else {
      throw new Error(`expected success, got ${roster.status}`);
    }
  });

  it('duplicate enrollment fails with an error notification', async () => {
    const { vm, notifications, studentId } = await build();
    await vm.enrollStudent(enrollDto(studentId));
    const outcome = await vm.enrollStudent(enrollDto(studentId));
    expect(outcome.ok).toBe(false);
    const kinds = notifications.store.getState().notifications.map((n) => n.kind);
    expect(kinds).toContain('error');
    expect(vm.store.getState().submission).toBe('failed');
  });
});
```

`packages/presentation/src/view-models/attendance/attendance-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AttendanceStatus, Gender } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { AttendanceViewModel } from './attendance-view-model';

async function build() {
  const { app } = createTestApplication();
  const student = await app.students.create({
    institutionId: 'inst-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    admissionNumber: 'ADM-001',
    dateOfBirth: '2015-06-01',
    gender: Gender.FEMALE,
  });
  const notifications = new NotificationStore();
  const vm = new AttendanceViewModel({ attendance: app.attendance, notifications });
  return { vm, notifications, studentId: student.data.id };
}

describe('AttendanceViewModel', () => {
  it('records attendance and loads formatted rows for class and date', async () => {
    const { vm, studentId } = await build();
    const outcome = await vm.recordAttendance({
      studentId,
      classId: 'cls-1',
      date: '2026-07-19',
      status: AttendanceStatus.PRESENT,
    });
    expect(outcome.ok).toBe(true);
    const records = vm.store.getState().records;
    expect(records.status).toBe('success');
    if (records.status === 'success') {
      expect(records.data[0]?.status).toEqual({ label: 'Present', badge: 'success' });
      expect(records.data[0]?.date).toBe('19 Jul 2026');
    }
    expect(vm.store.getState().classId).toBe('cls-1');
    expect(vm.store.getState().date).toBe('2026-07-19');
  });

  it('reports empty for a class/date with no records', async () => {
    const { vm } = await build();
    await vm.loadAttendance('cls-9', '2026-07-19');
    expect(vm.store.getState().records.status).toBe('empty');
  });

  it('recording for an unknown student fails with an error notification', async () => {
    const { vm, notifications } = await build();
    const outcome = await vm.recordAttendance({
      studentId: 'missing',
      classId: 'cls-1',
      date: '2026-07-19',
      status: AttendanceStatus.ABSENT,
    });
    expect(outcome.ok).toBe(false);
    expect(notifications.store.getState().notifications[0]?.kind).toBe('error');
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/view-models/class-roster/class-roster-views.ts`:

```ts
import type { StatusPresentation } from '../../presenters/status-presentation';

export interface EnrollmentRowView {
  readonly id: string;
  readonly studentId: string;
  readonly classId: string;
  readonly status: StatusPresentation;
  readonly updatedAt: string;
}

export interface ClassRosterView {
  readonly classId: string;
  readonly enrollments: readonly EnrollmentRowView[];
  readonly activeCount: number;
}
```

`packages/presentation/src/mappers/academics/enrollment-view-mapper.ts`:

```ts
import type { ClassRosterOutput, EnrollmentOutput } from '@nemis-desktop/application';
import { EnrollmentStatus } from '@nemis-desktop/types';
import { formatIsoDateTime } from '../../formatters/format-date';
import { presentEnrollmentStatus } from '../../presenters/present-status';
import type {
  ClassRosterView,
  EnrollmentRowView,
} from '../../view-models/class-roster/class-roster-views';

export function toEnrollmentRowView(dto: EnrollmentOutput): EnrollmentRowView {
  return {
    id: dto.id,
    studentId: dto.studentId,
    classId: dto.classId,
    status: presentEnrollmentStatus(dto.status),
    updatedAt: formatIsoDateTime(dto.updatedAt),
  };
}

export function toClassRosterView(dto: ClassRosterOutput): ClassRosterView {
  return {
    classId: dto.classId,
    enrollments: dto.enrollments.map(toEnrollmentRowView),
    activeCount: dto.enrollments.filter((e) => e.status === EnrollmentStatus.ACTIVE).length,
  };
}
```

`packages/presentation/src/commands/academics/enroll-student-ui-command.ts`:

```ts
import type { AcademicsApplicationService, EnrollStudentDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toEnrollmentRowView } from '../../mappers/academics/enrollment-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { EnrollmentRowView } from '../../view-models/class-roster/class-roster-views';

export interface AcademicsCommandDeps {
  readonly academics: AcademicsApplicationService;
  readonly notifications: NotificationStore;
}

export class EnrollStudentUiCommand {
  constructor(private readonly deps: AcademicsCommandDeps) {}

  execute(dto: EnrollStudentDto): Promise<CommandOutcome<EnrollmentRowView>> {
    return executeCommand({
      run: () => this.deps.academics.enroll(dto),
      map: toEnrollmentRowView,
      notifications: this.deps.notifications,
      successMessage: 'Student enrolled.',
    });
  }
}
```

`packages/presentation/src/commands/academics/withdraw-enrollment-ui-command.ts`:

```ts
import type { WithdrawEnrollmentDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toEnrollmentRowView } from '../../mappers/academics/enrollment-view-mapper';
import type { EnrollmentRowView } from '../../view-models/class-roster/class-roster-views';
import type { AcademicsCommandDeps } from './enroll-student-ui-command';

export class WithdrawEnrollmentUiCommand {
  constructor(private readonly deps: AcademicsCommandDeps) {}

  execute(dto: WithdrawEnrollmentDto): Promise<CommandOutcome<EnrollmentRowView>> {
    return executeCommand({
      run: () => this.deps.academics.withdraw(dto),
      map: toEnrollmentRowView,
      notifications: this.deps.notifications,
      successMessage: 'Enrollment withdrawn.',
    });
  }
}
```

`packages/presentation/src/queries/academics/get-class-roster-ui-query.ts`:

```ts
import type {
  AcademicsApplicationService,
  ApplicationResponse,
  ClassRosterOutput,
} from '@nemis-desktop/application';

export class GetClassRosterUiQuery {
  constructor(private readonly academics: AcademicsApplicationService) {}

  execute(classId: string): Promise<ApplicationResponse<ClassRosterOutput>> {
    return this.academics.getClassRoster({ classId });
  }
}
```

`packages/presentation/src/view-models/class-roster/class-roster-view-model.ts`:

```ts
import type {
  AcademicsApplicationService,
  EnrollStudentDto,
  WithdrawEnrollmentDto,
} from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { EnrollStudentUiCommand } from '../../commands/academics/enroll-student-ui-command';
import { WithdrawEnrollmentUiCommand } from '../../commands/academics/withdraw-enrollment-ui-command';
import { toClassRosterView } from '../../mappers/academics/enrollment-view-mapper';
import { GetClassRosterUiQuery } from '../../queries/academics/get-class-roster-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { ClassRosterView, EnrollmentRowView } from './class-roster-views';

export interface ClassRosterState {
  readonly classId: string | null;
  readonly roster: AsyncState<ClassRosterView>;
  readonly submission: SubmissionStatus;
}

export interface ClassRosterViewModelDeps {
  readonly academics: AcademicsApplicationService;
  readonly notifications: NotificationStore;
}

export class ClassRosterViewModel {
  readonly store = createStore<ClassRosterState>(() => ({
    classId: null,
    roster: idleState(),
    submission: 'idle',
  }));

  private readonly rosterQuery: GetClassRosterUiQuery;
  private readonly enrollCommand: EnrollStudentUiCommand;
  private readonly withdrawCommand: WithdrawEnrollmentUiCommand;

  constructor(deps: ClassRosterViewModelDeps) {
    this.rosterQuery = new GetClassRosterUiQuery(deps.academics);
    const commandDeps = { academics: deps.academics, notifications: deps.notifications };
    this.enrollCommand = new EnrollStudentUiCommand(commandDeps);
    this.withdrawCommand = new WithdrawEnrollmentUiCommand(commandDeps);
  }

  async loadRoster(classId: string): Promise<void> {
    this.store.setState({ classId });
    await trackQuery({
      access: {
        get: () => this.store.getState().roster,
        set: (roster) => this.store.setState({ roster }),
      },
      fetch: () => this.rosterQuery.execute(classId),
      map: toClassRosterView,
      isEmpty: (view) => view.enrollments.length === 0,
    });
  }

  async enrollStudent(dto: EnrollStudentDto): Promise<CommandOutcome<EnrollmentRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.enrollCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadRoster(dto.classId);
    return outcome;
  }

  async withdrawEnrollment(dto: WithdrawEnrollmentDto): Promise<CommandOutcome<EnrollmentRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.withdrawCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    const classId = this.store.getState().classId;
    if (outcome.ok && classId) await this.loadRoster(classId);
    return outcome;
  }
}
```

`packages/presentation/src/view-models/attendance/attendance-views.ts`:

```ts
import type { StatusPresentation } from '../../presenters/status-presentation';

export interface AttendanceRowView {
  readonly id: string;
  readonly studentId: string;
  readonly date: string;
  readonly status: StatusPresentation;
}
```

`packages/presentation/src/mappers/attendance/attendance-view-mapper.ts`:

```ts
import type { AttendanceOutput } from '@nemis-desktop/application';
import { formatIsoDate } from '../../formatters/format-date';
import { presentAttendanceStatus } from '../../presenters/present-status';
import type { AttendanceRowView } from '../../view-models/attendance/attendance-views';

export function toAttendanceRowView(dto: AttendanceOutput): AttendanceRowView {
  return {
    id: dto.id,
    studentId: dto.studentId,
    date: formatIsoDate(dto.date),
    status: presentAttendanceStatus(dto.status),
  };
}
```

`packages/presentation/src/commands/attendance/record-attendance-ui-command.ts`:

```ts
import type { AttendanceApplicationService, RecordAttendanceDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toAttendanceRowView } from '../../mappers/attendance/attendance-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { AttendanceRowView } from '../../view-models/attendance/attendance-views';

export interface AttendanceCommandDeps {
  readonly attendance: AttendanceApplicationService;
  readonly notifications: NotificationStore;
}

export class RecordAttendanceUiCommand {
  constructor(private readonly deps: AttendanceCommandDeps) {}

  execute(dto: RecordAttendanceDto): Promise<CommandOutcome<AttendanceRowView>> {
    return executeCommand({
      run: () => this.deps.attendance.record(dto),
      map: toAttendanceRowView,
      notifications: this.deps.notifications,
      successMessage: 'Attendance recorded.',
    });
  }
}
```

`packages/presentation/src/queries/attendance/get-attendance-ui-query.ts`:

```ts
import type {
  ApplicationResponse,
  AttendanceApplicationService,
  AttendanceOutput,
  GetAttendanceByClassAndDateDto,
} from '@nemis-desktop/application';

export class GetAttendanceUiQuery {
  constructor(private readonly attendance: AttendanceApplicationService) {}

  execute(dto: GetAttendanceByClassAndDateDto): Promise<ApplicationResponse<AttendanceOutput[]>> {
    return this.attendance.getByClassAndDate(dto);
  }
}
```

`packages/presentation/src/view-models/attendance/attendance-view-model.ts`:

```ts
import type { AttendanceApplicationService, RecordAttendanceDto } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { RecordAttendanceUiCommand } from '../../commands/attendance/record-attendance-ui-command';
import { toAttendanceRowView } from '../../mappers/attendance/attendance-view-mapper';
import { GetAttendanceUiQuery } from '../../queries/attendance/get-attendance-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { AttendanceRowView } from './attendance-views';

export interface AttendanceState {
  readonly classId: string | null;
  readonly date: string | null;
  readonly records: AsyncState<readonly AttendanceRowView[]>;
  readonly submission: SubmissionStatus;
}

export interface AttendanceViewModelDeps {
  readonly attendance: AttendanceApplicationService;
  readonly notifications: NotificationStore;
}

export class AttendanceViewModel {
  readonly store = createStore<AttendanceState>(() => ({
    classId: null,
    date: null,
    records: idleState(),
    submission: 'idle',
  }));

  private readonly attendanceQuery: GetAttendanceUiQuery;
  private readonly recordCommand: RecordAttendanceUiCommand;

  constructor(deps: AttendanceViewModelDeps) {
    this.attendanceQuery = new GetAttendanceUiQuery(deps.attendance);
    this.recordCommand = new RecordAttendanceUiCommand({
      attendance: deps.attendance,
      notifications: deps.notifications,
    });
  }

  async loadAttendance(classId: string, date: string): Promise<void> {
    this.store.setState({ classId, date });
    await trackQuery({
      access: {
        get: () => this.store.getState().records,
        set: (records) => this.store.setState({ records }),
      },
      fetch: () => this.attendanceQuery.execute({ classId, date }),
      map: (rows) => rows.map(toAttendanceRowView),
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async recordAttendance(dto: RecordAttendanceDto): Promise<CommandOutcome<AttendanceRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.recordCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadAttendance(dto.classId, dto.date);
    return outcome;
  }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src
git commit -m "feat(presentation): add ClassRoster and Attendance slices"
```

---

### Task 14: Assessments slice

**Files:**

- Create: `packages/presentation/src/view-models/assessments/assessments-views.ts`
- Create: `packages/presentation/src/mappers/assessments/assessment-view-mapper.ts`
- Create: `packages/presentation/src/commands/assessments/create-assessment-ui-command.ts`
- Create: `packages/presentation/src/commands/assessments/record-grade-ui-command.ts`
- Create: `packages/presentation/src/commands/assessments/publish-grade-ui-command.ts`
- Create: `packages/presentation/src/queries/assessments/get-grades-by-student-ui-query.ts`
- Create: `packages/presentation/src/view-models/assessments/assessments-view-model.ts`
- Test: `packages/presentation/src/view-models/assessments/assessments-view-model.test.ts`

**Interfaces:**

- Consumes: `AssessmentsApplicationService` (`createAssessment/recordGrade/publishGrade/getGradesByStudent`), DTOs `CreateAssessmentDto`, `RecordGradeDto`, `PublishGradeDto`, `AssessmentOutput`, `GradeOutput`; `AssessmentType`, `GradeStatus` enums. Note Phase-5 N1: RecordGrade/CreateAssessment do no existence checks; PublishGrade requires a `SUBMITTED` grade.
- Produces:
  - `GradeRowView { id; studentId; subjectId; marks: string; percent: string; status: StatusPresentation }`, `AssessmentView { id; typeLabel: string; marks: string; updatedAt: string }`, `toGradeRowView(dto: GradeOutput)`, `toAssessmentView(dto: AssessmentOutput)`
  - `AssessmentsCommandDeps { assessments; notifications }`; `CreateAssessmentUiCommand` → `CommandOutcome<AssessmentView>`; `RecordGradeUiCommand` / `PublishGradeUiCommand` → `CommandOutcome<GradeRowView>`; `GetGradesByStudentUiQuery.execute(studentId)`
  - `AssessmentsState { studentId: string | null; grades: AsyncState<readonly GradeRowView[]>; lastAssessment: AsyncState<AssessmentView>; submission: SubmissionStatus }`
  - `class AssessmentsViewModel { store; loadGrades(studentId); createAssessment(dto); recordGrade(dto); publishGrade(dto) }` with deps `{ assessments: AssessmentsApplicationService; notifications: NotificationStore }`

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/view-models/assessments/assessments-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AssessmentType, GradeStatus } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { AssessmentsViewModel } from './assessments-view-model';

function build() {
  const { app } = createTestApplication();
  const notifications = new NotificationStore();
  const vm = new AssessmentsViewModel({ assessments: app.assessments, notifications });
  return { vm, notifications };
}

const gradeDto = {
  studentId: 'stu-1',
  subjectId: 'sub-1',
  obtained: 45,
  total: 100,
  status: GradeStatus.SUBMITTED,
} as const;

describe('AssessmentsViewModel', () => {
  it('records a grade and loads formatted rows for the student', async () => {
    const { vm } = build();
    const outcome = await vm.recordGrade(gradeDto);
    expect(outcome.ok).toBe(true);
    const grades = vm.store.getState().grades;
    expect(grades.status).toBe('success');
    if (grades.status === 'success') {
      expect(grades.data[0]?.marks).toBe('45 / 100');
      expect(grades.data[0]?.percent).toBe('45%');
      expect(grades.data[0]?.status.label).toBe('Submitted');
    }
    expect(vm.store.getState().studentId).toBe('stu-1');
  });

  it('publishes a submitted grade and refreshes the rows', async () => {
    const { vm } = build();
    const recorded = await vm.recordGrade(gradeDto);
    if (!recorded.ok) throw new Error('record failed');
    const outcome = await vm.publishGrade({ gradeId: recorded.data.id, actorId: 'usr-1' });
    expect(outcome.ok).toBe(true);
    const grades = vm.store.getState().grades;
    if (grades.status === 'success') {
      expect(grades.data[0]?.status).toEqual({ label: 'Published', badge: 'success' });
    } else {
      throw new Error(`expected success, got ${grades.status}`);
    }
  });

  it('publishing a draft grade fails with an error notification', async () => {
    const { vm, notifications } = build();
    const recorded = await vm.recordGrade({ ...gradeDto, status: GradeStatus.DRAFT });
    if (!recorded.ok) throw new Error('record failed');
    const outcome = await vm.publishGrade({ gradeId: recorded.data.id, actorId: 'usr-1' });
    expect(outcome.ok).toBe(false);
    const kinds = notifications.store.getState().notifications.map((n) => n.kind);
    expect(kinds).toContain('error');
  });

  it('creates an assessment and exposes it as lastAssessment', async () => {
    const { vm } = build();
    const outcome = await vm.createAssessment({
      classId: 'cls-1',
      subjectId: 'sub-1',
      gradingPeriodId: 'gp-1',
      type: AssessmentType.EXAM,
      totalMarks: 100,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.data.typeLabel).toBe('Exam');
    const last = vm.store.getState().lastAssessment;
    expect(last.status).toBe('success');
  });

  it('reports empty when the student has no grades', async () => {
    const { vm } = build();
    await vm.loadGrades('stu-none');
    expect(vm.store.getState().grades.status).toBe('empty');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/view-models/assessments/assessments-views.ts`:

```ts
import type { StatusPresentation } from '../../presenters/status-presentation';

export interface GradeRowView {
  readonly id: string;
  readonly studentId: string;
  readonly subjectId: string;
  readonly marks: string;
  readonly percent: string;
  readonly status: StatusPresentation;
}

export interface AssessmentView {
  readonly id: string;
  readonly typeLabel: string;
  readonly marks: string;
  readonly updatedAt: string;
}
```

`packages/presentation/src/mappers/assessments/assessment-view-mapper.ts`:

```ts
import type { AssessmentOutput, GradeOutput } from '@nemis-desktop/application';
import { formatIsoDateTime } from '../../formatters/format-date';
import { formatMarks, formatPercent } from '../../formatters/format-marks';
import { humanizeEnum } from '../../formatters/format-text';
import { presentGradeStatus } from '../../presenters/present-status';
import type { AssessmentView, GradeRowView } from '../../view-models/assessments/assessments-views';

export function toGradeRowView(dto: GradeOutput): GradeRowView {
  return {
    id: dto.id,
    studentId: dto.studentId,
    subjectId: dto.subjectId,
    marks: formatMarks(dto.obtained, dto.total),
    percent: formatPercent(dto.obtained, dto.total),
    status: presentGradeStatus(dto.status, dto.isPublished),
  };
}

export function toAssessmentView(dto: AssessmentOutput): AssessmentView {
  return {
    id: dto.id,
    typeLabel: humanizeEnum(dto.type),
    marks: formatMarks(dto.obtainedMarks, dto.totalMarks),
    updatedAt: formatIsoDateTime(dto.updatedAt),
  };
}
```

`packages/presentation/src/commands/assessments/create-assessment-ui-command.ts`:

```ts
import type {
  AssessmentsApplicationService,
  CreateAssessmentDto,
} from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toAssessmentView } from '../../mappers/assessments/assessment-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { AssessmentView } from '../../view-models/assessments/assessments-views';

export interface AssessmentsCommandDeps {
  readonly assessments: AssessmentsApplicationService;
  readonly notifications: NotificationStore;
}

export class CreateAssessmentUiCommand {
  constructor(private readonly deps: AssessmentsCommandDeps) {}

  execute(dto: CreateAssessmentDto): Promise<CommandOutcome<AssessmentView>> {
    return executeCommand({
      run: () => this.deps.assessments.createAssessment(dto),
      map: toAssessmentView,
      notifications: this.deps.notifications,
      successMessage: 'Assessment created.',
    });
  }
}
```

`packages/presentation/src/commands/assessments/record-grade-ui-command.ts`:

```ts
import type { RecordGradeDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toGradeRowView } from '../../mappers/assessments/assessment-view-mapper';
import type { GradeRowView } from '../../view-models/assessments/assessments-views';
import type { AssessmentsCommandDeps } from './create-assessment-ui-command';

export class RecordGradeUiCommand {
  constructor(private readonly deps: AssessmentsCommandDeps) {}

  execute(dto: RecordGradeDto): Promise<CommandOutcome<GradeRowView>> {
    return executeCommand({
      run: () => this.deps.assessments.recordGrade(dto),
      map: toGradeRowView,
      notifications: this.deps.notifications,
      successMessage: 'Grade recorded.',
    });
  }
}
```

`packages/presentation/src/commands/assessments/publish-grade-ui-command.ts`:

```ts
import type { PublishGradeDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toGradeRowView } from '../../mappers/assessments/assessment-view-mapper';
import type { GradeRowView } from '../../view-models/assessments/assessments-views';
import type { AssessmentsCommandDeps } from './create-assessment-ui-command';

export class PublishGradeUiCommand {
  constructor(private readonly deps: AssessmentsCommandDeps) {}

  execute(dto: PublishGradeDto): Promise<CommandOutcome<GradeRowView>> {
    return executeCommand({
      run: () => this.deps.assessments.publishGrade(dto),
      map: toGradeRowView,
      notifications: this.deps.notifications,
      successMessage: 'Grade published.',
    });
  }
}
```

`packages/presentation/src/queries/assessments/get-grades-by-student-ui-query.ts`:

```ts
import type {
  ApplicationResponse,
  AssessmentsApplicationService,
  GradeOutput,
} from '@nemis-desktop/application';

export class GetGradesByStudentUiQuery {
  constructor(private readonly assessments: AssessmentsApplicationService) {}

  execute(studentId: string): Promise<ApplicationResponse<GradeOutput[]>> {
    return this.assessments.getGradesByStudent({ studentId });
  }
}
```

`packages/presentation/src/view-models/assessments/assessments-view-model.ts`:

```ts
import type {
  AssessmentsApplicationService,
  CreateAssessmentDto,
  PublishGradeDto,
  RecordGradeDto,
} from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { CreateAssessmentUiCommand } from '../../commands/assessments/create-assessment-ui-command';
import { PublishGradeUiCommand } from '../../commands/assessments/publish-grade-ui-command';
import { RecordGradeUiCommand } from '../../commands/assessments/record-grade-ui-command';
import { toGradeRowView } from '../../mappers/assessments/assessment-view-mapper';
import { GetGradesByStudentUiQuery } from '../../queries/assessments/get-grades-by-student-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { AssessmentView, GradeRowView } from './assessments-views';

export interface AssessmentsState {
  readonly studentId: string | null;
  readonly grades: AsyncState<readonly GradeRowView[]>;
  readonly lastAssessment: AsyncState<AssessmentView>;
  readonly submission: SubmissionStatus;
}

export interface AssessmentsViewModelDeps {
  readonly assessments: AssessmentsApplicationService;
  readonly notifications: NotificationStore;
}

export class AssessmentsViewModel {
  readonly store = createStore<AssessmentsState>(() => ({
    studentId: null,
    grades: idleState(),
    lastAssessment: idleState(),
    submission: 'idle',
  }));

  private readonly gradesQuery: GetGradesByStudentUiQuery;
  private readonly createAssessmentCommand: CreateAssessmentUiCommand;
  private readonly recordGradeCommand: RecordGradeUiCommand;
  private readonly publishGradeCommand: PublishGradeUiCommand;

  constructor(deps: AssessmentsViewModelDeps) {
    this.gradesQuery = new GetGradesByStudentUiQuery(deps.assessments);
    const commandDeps = { assessments: deps.assessments, notifications: deps.notifications };
    this.createAssessmentCommand = new CreateAssessmentUiCommand(commandDeps);
    this.recordGradeCommand = new RecordGradeUiCommand(commandDeps);
    this.publishGradeCommand = new PublishGradeUiCommand(commandDeps);
  }

  async loadGrades(studentId: string): Promise<void> {
    this.store.setState({ studentId });
    await trackQuery({
      access: {
        get: () => this.store.getState().grades,
        set: (grades) => this.store.setState({ grades }),
      },
      fetch: () => this.gradesQuery.execute(studentId),
      map: (rows) => rows.map(toGradeRowView),
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async createAssessment(dto: CreateAssessmentDto): Promise<CommandOutcome<AssessmentView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.createAssessmentCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.store.setState({ lastAssessment: { status: 'success', data: outcome.data } });
    }
    return outcome;
  }

  async recordGrade(dto: RecordGradeDto): Promise<CommandOutcome<GradeRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.recordGradeCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadGrades(dto.studentId);
    return outcome;
  }

  async publishGrade(dto: PublishGradeDto): Promise<CommandOutcome<GradeRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.publishGradeCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    const studentId = this.store.getState().studentId;
    if (outcome.ok && studentId) await this.loadGrades(studentId);
    return outcome;
  }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src
git commit -m "feat(presentation): add Assessments slice"
```

---

### Task 15: Settings, Device, and CurrentUser slices

**Files:**

- Create: `packages/presentation/src/view-models/settings/settings-views.ts`
- Create: `packages/presentation/src/mappers/institution/institution-view-mapper.ts`
- Create: `packages/presentation/src/mappers/infra/infra-view-mapper.ts`
- Create: `packages/presentation/src/mappers/identity/user-view-mapper.ts`
- Create: `packages/presentation/src/commands/settings/update-grading-config-ui-command.ts`
- Create: `packages/presentation/src/commands/settings/update-setting-ui-command.ts`
- Create: `packages/presentation/src/commands/device/register-device-ui-command.ts`
- Create: `packages/presentation/src/queries/settings/get-institution-profile-ui-query.ts`
- Create: `packages/presentation/src/queries/identity/get-user-by-id-ui-query.ts`
- Create: `packages/presentation/src/view-models/settings/settings-view-model.ts`
- Create: `packages/presentation/src/view-models/device/device-views.ts`
- Create: `packages/presentation/src/view-models/device/device-view-model.ts`
- Create: `packages/presentation/src/view-models/current-user/current-user-views.ts`
- Create: `packages/presentation/src/view-models/current-user/current-user-view-model.ts`
- Test: `packages/presentation/src/view-models/settings/settings-view-model.test.ts`
- Test: `packages/presentation/src/view-models/device/device-view-model.test.ts`
- Test: `packages/presentation/src/view-models/current-user/current-user-view-model.test.ts`

**Interfaces:**

- Consumes: `InstitutionApplicationService` (`getProfile/updateGradingConfig`), `InfraApplicationService` (`registerDevice/updateSettings`), `IdentityApplicationService` (`getUserById`), DTOs `InstitutionProfileOutput`, `UpdateGradingConfigDto`, `GradingConfigOutput`, `RegisterDeviceDto`, `DeviceOutput`, `UpdateSettingsDto`, `SettingOutput`, `UserOutput`; `SessionStore`.
- Produces:
  - Views: `InstitutionProfileView { id; code; name; typeLabel; ownershipLabel; approval: StatusPresentation; address: string }` and `GradingConfigView { id; maxMarks; passingMarks; requireAdminApproval }` (in `settings-views.ts`); `DeviceView { id; deviceName; platform; appVersion; registeredAt }` and `SettingView { key; value: unknown; updatedAt }` (in `device-views.ts`); `UserView { id; fullName; email; roleLabels: readonly string[]; status: StatusPresentation }` (in `current-user-views.ts`)
  - Mappers: `toInstitutionProfileView`, `toGradingConfigView`, `toDeviceView`, `toSettingView`, `toUserView`
  - Commands: `UpdateGradingConfigUiCommand` → `CommandOutcome<GradingConfigView>`; `UpdateSettingUiCommand` → `CommandOutcome<SettingView>` (both deps `{ institution?/infra; notifications }` as shown below); `RegisterDeviceUiCommand` → `CommandOutcome<DeviceView>`
  - Queries: `GetInstitutionProfileUiQuery.execute(institutionId)`; `GetUserByIdUiQuery.execute(userId)` (in `queries/identity/` — distinct from the students one by folder)
  - `SettingsState { profile: AsyncState<InstitutionProfileView>; gradingConfig: AsyncState<GradingConfigView>; submission }`, `class SettingsViewModel { store; loadProfile(institutionId); saveGradingConfig(dto); saveSetting(dto) }` deps `{ institution; infra; notifications }`
  - `DeviceState { device: AsyncState<DeviceView>; submission }`, `class DeviceViewModel { store; registerDevice(dto) }` deps `{ infra; notifications; session }` — success sets `session.setCurrentDevice(view.id)`
  - `CurrentUserState { user: AsyncState<UserView> }`, `class CurrentUserViewModel { store; loadUser(userId) }` deps `{ identity; session }` — success sets `session.setCurrentUser(dto.id)`, empty sets `session.setCurrentUser(null)`

- [ ] **Step 1: Write the failing tests**

`packages/presentation/src/view-models/settings/settings-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { SettingsViewModel } from './settings-view-model';

function build() {
  const { app, ports } = createTestApplication();
  ports.institutions.store.set(
    'inst-1',
    Institution.reconstitute({
      id: 'inst-1',
      code: 'lib-001',
      name: 'Monrovia Central',
      type: InstitutionType.SCHOOL,
      ownership: OwnershipType.GOVERNMENT,
      countyId: 'county-1',
      approvalStatus: ApprovalStatus.APPROVED,
      address: { communityTown: 'Sinkor' },
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const notifications = new NotificationStore();
  const vm = new SettingsViewModel({
    institution: app.institution,
    infra: app.infra,
    notifications,
  });
  return { vm, notifications };
}

describe('SettingsViewModel', () => {
  it('loads the formatted institution profile', async () => {
    const { vm } = build();
    await vm.loadProfile('inst-1');
    const profile = vm.store.getState().profile;
    expect(profile.status).toBe('success');
    if (profile.status === 'success') {
      expect(profile.data.name).toBe('Monrovia Central');
      expect(profile.data.typeLabel).toBe('School');
      expect(profile.data.approval).toEqual({ label: 'Approved', badge: 'success' });
      expect(profile.data.address).toBe('Sinkor');
    }
  });

  it('reports empty for a missing institution', async () => {
    const { vm } = build();
    await vm.loadProfile('missing');
    expect(vm.store.getState().profile.status).toBe('empty');
  });

  it('saves a grading config and stores the result', async () => {
    const { vm } = build();
    const outcome = await vm.saveGradingConfig({
      id: 'inst-1',
      maxMarks: 100,
      passingMarks: 50,
      requireAdminApproval: true,
    });
    expect(outcome.ok).toBe(true);
    const config = vm.store.getState().gradingConfig;
    expect(config.status).toBe('success');
    if (config.status === 'success') expect(config.data.passingMarks).toBe(50);
  });

  it('rejects an invalid grading config with an error notification', async () => {
    const { vm, notifications } = build();
    const outcome = await vm.saveGradingConfig({
      id: 'inst-1',
      maxMarks: 50,
      passingMarks: 90,
      requireAdminApproval: false,
    });
    expect(outcome.ok).toBe(false);
    expect(notifications.store.getState().notifications[0]?.kind).toBe('error');
    expect(vm.store.getState().submission).toBe('failed');
  });

  it('saves a setting with a success notification', async () => {
    const { vm, notifications } = build();
    const outcome = await vm.saveSetting({ key: 'theme', value: 'dark' });
    expect(outcome.ok).toBe(true);
    expect(notifications.store.getState().notifications[0]?.kind).toBe('success');
  });
});
```

`packages/presentation/src/view-models/device/device-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NotificationStore } from '../../stores/notification-store';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { DeviceViewModel } from './device-view-model';

describe('DeviceViewModel', () => {
  it('registers the device, stores it, and records it in the session', async () => {
    const { app } = createTestApplication();
    const notifications = new NotificationStore();
    const session = new SessionStore();
    const vm = new DeviceViewModel({ infra: app.infra, notifications, session });
    const outcome = await vm.registerDevice({
      deviceName: 'Front-desk PC',
      platform: 'win32',
      osVersion: '10.0.19045',
      appVersion: '1.0.0',
    });
    expect(outcome.ok).toBe(true);
    const device = vm.store.getState().device;
    expect(device.status).toBe('success');
    if (device.status === 'success') {
      expect(device.data.deviceName).toBe('Front-desk PC');
      expect(session.store.getState().currentDeviceId).toBe(device.data.id);
    }
    expect(notifications.store.getState().notifications[0]?.kind).toBe('success');
  });
});
```

`packages/presentation/src/view-models/current-user/current-user-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { User, UserOrganization } from '@nemis-desktop/domain';
import { SystemRole } from '@nemis-desktop/types';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { CurrentUserViewModel } from './current-user-view-model';

function build() {
  const { app, ports } = createTestApplication();
  ports.users.store.set(
    'usr-1',
    User.reconstitute({
      id: 'usr-1',
      firstName: 'Joseph',
      lastName: 'Boakai',
      email: 'joseph@example.com',
      isActive: true,
      organizations: [
        UserOrganization.reconstitute({
          id: 'org-1',
          role: SystemRole.INSTITUTION_ADMIN,
          institutionId: 'inst-1',
          isActive: true,
        }),
      ],
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const session = new SessionStore();
  const vm = new CurrentUserViewModel({ identity: app.identity, session });
  return { vm, session };
}

describe('CurrentUserViewModel', () => {
  it('loads the user view and records the session user', async () => {
    const { vm, session } = build();
    await vm.loadUser('usr-1');
    const user = vm.store.getState().user;
    expect(user.status).toBe('success');
    if (user.status === 'success') {
      expect(user.data.fullName).toBe('Joseph Boakai');
      expect(user.data.roleLabels).toEqual(['Institution admin']);
      expect(user.data.status.label).toBe('Active');
    }
    expect(session.store.getState().currentUserId).toBe('usr-1');
  });

  it('clears the session user when the user is missing', async () => {
    const { vm, session } = build();
    session.setCurrentUser('stale');
    await vm.loadUser('missing');
    expect(vm.store.getState().user.status).toBe('empty');
    expect(session.store.getState().currentUserId).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/view-models/settings/settings-views.ts`:

```ts
import type { StatusPresentation } from '../../presenters/status-presentation';

export interface InstitutionProfileView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly ownershipLabel: string;
  readonly approval: StatusPresentation;
  readonly address: string;
}

export interface GradingConfigView {
  readonly id: string;
  readonly maxMarks: number;
  readonly passingMarks: number;
  readonly requireAdminApproval: boolean;
}
```

`packages/presentation/src/mappers/institution/institution-view-mapper.ts`:

```ts
import type { GradingConfigOutput, InstitutionProfileOutput } from '@nemis-desktop/application';
import { humanizeEnum } from '../../formatters/format-text';
import { presentApprovalStatus } from '../../presenters/present-status';
import type {
  GradingConfigView,
  InstitutionProfileView,
} from '../../view-models/settings/settings-views';

export function toInstitutionProfileView(dto: InstitutionProfileOutput): InstitutionProfileView {
  const address = [dto.street, dto.communityTown].filter(Boolean).join(', ');
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    typeLabel: humanizeEnum(dto.type),
    ownershipLabel: humanizeEnum(dto.ownership),
    approval: presentApprovalStatus(dto.approvalStatus),
    address: address === '' ? '—' : address,
  };
}

export function toGradingConfigView(dto: GradingConfigOutput): GradingConfigView {
  return {
    id: dto.id,
    maxMarks: dto.maxMarks,
    passingMarks: dto.passingMarks,
    requireAdminApproval: dto.requireAdminApproval,
  };
}
```

`packages/presentation/src/view-models/device/device-views.ts`:

```ts
export interface DeviceView {
  readonly id: string;
  readonly deviceName: string;
  readonly platform: string;
  readonly appVersion: string;
  readonly registeredAt: string;
}

export interface SettingView {
  readonly key: string;
  readonly value: unknown;
  readonly updatedAt: string;
}
```

`packages/presentation/src/mappers/infra/infra-view-mapper.ts`:

```ts
import type { DeviceOutput, SettingOutput } from '@nemis-desktop/application';
import { formatIsoDateTime } from '../../formatters/format-date';
import type { DeviceView, SettingView } from '../../view-models/device/device-views';

export function toDeviceView(dto: DeviceOutput): DeviceView {
  return {
    id: dto.id,
    deviceName: dto.deviceName,
    platform: `${dto.platform} ${dto.osVersion}`,
    appVersion: dto.appVersion,
    registeredAt: formatIsoDateTime(dto.createdAt),
  };
}

export function toSettingView(dto: SettingOutput): SettingView {
  return { key: dto.key, value: dto.value, updatedAt: formatIsoDateTime(dto.updatedAt) };
}
```

`packages/presentation/src/view-models/current-user/current-user-views.ts`:

```ts
import type { StatusPresentation } from '../../presenters/status-presentation';

export interface UserView {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly roleLabels: readonly string[];
  readonly status: StatusPresentation;
}
```

`packages/presentation/src/mappers/identity/user-view-mapper.ts`:

```ts
import type { UserOutput } from '@nemis-desktop/application';
import { humanizeEnum } from '../../formatters/format-text';
import { presentActive } from '../../presenters/present-status';
import type { UserView } from '../../view-models/current-user/current-user-views';

export function toUserView(dto: UserOutput): UserView {
  return {
    id: dto.id,
    fullName: dto.fullName,
    email: dto.email,
    roleLabels: dto.roles.map(humanizeEnum),
    status: presentActive(dto.isActive),
  };
}
```

`packages/presentation/src/commands/settings/update-grading-config-ui-command.ts`:

```ts
import type {
  InstitutionApplicationService,
  UpdateGradingConfigDto,
} from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toGradingConfigView } from '../../mappers/institution/institution-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { GradingConfigView } from '../../view-models/settings/settings-views';

export class UpdateGradingConfigUiCommand {
  constructor(
    private readonly deps: {
      readonly institution: InstitutionApplicationService;
      readonly notifications: NotificationStore;
    },
  ) {}

  execute(dto: UpdateGradingConfigDto): Promise<CommandOutcome<GradingConfigView>> {
    return executeCommand({
      run: () => this.deps.institution.updateGradingConfig(dto),
      map: toGradingConfigView,
      notifications: this.deps.notifications,
      successMessage: 'Grading configuration saved.',
    });
  }
}
```

`packages/presentation/src/commands/settings/update-setting-ui-command.ts`:

```ts
import type { InfraApplicationService, UpdateSettingsDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toSettingView } from '../../mappers/infra/infra-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { SettingView } from '../../view-models/device/device-views';

export class UpdateSettingUiCommand {
  constructor(
    private readonly deps: {
      readonly infra: InfraApplicationService;
      readonly notifications: NotificationStore;
    },
  ) {}

  execute(dto: UpdateSettingsDto): Promise<CommandOutcome<SettingView>> {
    return executeCommand({
      run: () => this.deps.infra.updateSettings(dto),
      map: toSettingView,
      notifications: this.deps.notifications,
      successMessage: 'Setting saved.',
    });
  }
}
```

`packages/presentation/src/commands/device/register-device-ui-command.ts`:

```ts
import type { InfraApplicationService, RegisterDeviceDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toDeviceView } from '../../mappers/infra/infra-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { DeviceView } from '../../view-models/device/device-views';

export class RegisterDeviceUiCommand {
  constructor(
    private readonly deps: {
      readonly infra: InfraApplicationService;
      readonly notifications: NotificationStore;
    },
  ) {}

  execute(dto: RegisterDeviceDto): Promise<CommandOutcome<DeviceView>> {
    return executeCommand({
      run: () => this.deps.infra.registerDevice(dto),
      map: toDeviceView,
      notifications: this.deps.notifications,
      successMessage: 'Device registered.',
    });
  }
}
```

`packages/presentation/src/queries/settings/get-institution-profile-ui-query.ts`:

```ts
import type {
  ApplicationResponse,
  InstitutionApplicationService,
  InstitutionProfileOutput,
} from '@nemis-desktop/application';

export class GetInstitutionProfileUiQuery {
  constructor(private readonly institution: InstitutionApplicationService) {}

  execute(institutionId: string): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.institution.getProfile({ institutionId });
  }
}
```

`packages/presentation/src/queries/identity/get-user-by-id-ui-query.ts`:

```ts
import type {
  ApplicationResponse,
  IdentityApplicationService,
  UserOutput,
} from '@nemis-desktop/application';

export class GetUserByIdUiQuery {
  constructor(private readonly identity: IdentityApplicationService) {}

  execute(userId: string): Promise<ApplicationResponse<UserOutput | null>> {
    return this.identity.getUserById({ userId });
  }
}
```

`packages/presentation/src/view-models/settings/settings-view-model.ts`:

```ts
import type {
  InfraApplicationService,
  InstitutionApplicationService,
  UpdateGradingConfigDto,
  UpdateSettingsDto,
} from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { UpdateGradingConfigUiCommand } from '../../commands/settings/update-grading-config-ui-command';
import { UpdateSettingUiCommand } from '../../commands/settings/update-setting-ui-command';
import { toInstitutionProfileView } from '../../mappers/institution/institution-view-mapper';
import { GetInstitutionProfileUiQuery } from '../../queries/settings/get-institution-profile-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { SettingView } from '../device/device-views';
import type { GradingConfigView, InstitutionProfileView } from './settings-views';

export interface SettingsState {
  readonly profile: AsyncState<InstitutionProfileView>;
  readonly gradingConfig: AsyncState<GradingConfigView>;
  readonly submission: SubmissionStatus;
}

export interface SettingsViewModelDeps {
  readonly institution: InstitutionApplicationService;
  readonly infra: InfraApplicationService;
  readonly notifications: NotificationStore;
}

export class SettingsViewModel {
  readonly store = createStore<SettingsState>(() => ({
    profile: idleState(),
    gradingConfig: idleState(),
    submission: 'idle',
  }));

  private readonly profileQuery: GetInstitutionProfileUiQuery;
  private readonly gradingConfigCommand: UpdateGradingConfigUiCommand;
  private readonly settingCommand: UpdateSettingUiCommand;

  constructor(deps: SettingsViewModelDeps) {
    this.profileQuery = new GetInstitutionProfileUiQuery(deps.institution);
    this.gradingConfigCommand = new UpdateGradingConfigUiCommand({
      institution: deps.institution,
      notifications: deps.notifications,
    });
    this.settingCommand = new UpdateSettingUiCommand({
      infra: deps.infra,
      notifications: deps.notifications,
    });
  }

  async loadProfile(institutionId: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().profile,
        set: (profile) => this.store.setState({ profile }),
      },
      fetch: () => this.profileQuery.execute(institutionId),
      map: toInstitutionProfileView,
    });
  }

  async saveGradingConfig(dto: UpdateGradingConfigDto): Promise<CommandOutcome<GradingConfigView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.gradingConfigCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.store.setState({ gradingConfig: { status: 'success', data: outcome.data } });
    }
    return outcome;
  }

  async saveSetting(dto: UpdateSettingsDto): Promise<CommandOutcome<SettingView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.settingCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    return outcome;
  }
}
```

`packages/presentation/src/view-models/device/device-view-model.ts`:

```ts
import type { InfraApplicationService, RegisterDeviceDto } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import type { CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { RegisterDeviceUiCommand } from '../../commands/device/register-device-ui-command';
import type { NotificationStore } from '../../stores/notification-store';
import type { SessionStore } from '../../stores/session-store';
import type { DeviceView } from './device-views';

export interface DeviceState {
  readonly device: AsyncState<DeviceView>;
  readonly submission: SubmissionStatus;
}

export interface DeviceViewModelDeps {
  readonly infra: InfraApplicationService;
  readonly notifications: NotificationStore;
  readonly session: SessionStore;
}

export class DeviceViewModel {
  readonly store = createStore<DeviceState>(() => ({
    device: idleState(),
    submission: 'idle',
  }));

  private readonly registerCommand: RegisterDeviceUiCommand;

  constructor(private readonly deps: DeviceViewModelDeps) {
    this.registerCommand = new RegisterDeviceUiCommand({
      infra: deps.infra,
      notifications: deps.notifications,
    });
  }

  async registerDevice(dto: RegisterDeviceDto): Promise<CommandOutcome<DeviceView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.registerCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.store.setState({ device: { status: 'success', data: outcome.data } });
      this.deps.session.setCurrentDevice(outcome.data.id);
    }
    return outcome;
  }
}
```

`packages/presentation/src/view-models/current-user/current-user-view-model.ts`:

```ts
import type { IdentityApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toUserView } from '../../mappers/identity/user-view-mapper';
import { GetUserByIdUiQuery } from '../../queries/identity/get-user-by-id-ui-query';
import type { SessionStore } from '../../stores/session-store';
import type { UserView } from './current-user-views';

export interface CurrentUserState {
  readonly user: AsyncState<UserView>;
}

export interface CurrentUserViewModelDeps {
  readonly identity: IdentityApplicationService;
  readonly session: SessionStore;
}

export class CurrentUserViewModel {
  readonly store = createStore<CurrentUserState>(() => ({ user: idleState() }));

  private readonly userQuery: GetUserByIdUiQuery;

  constructor(private readonly deps: CurrentUserViewModelDeps) {
    this.userQuery = new GetUserByIdUiQuery(deps.identity);
  }

  async loadUser(userId: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().user,
        set: (user) => this.store.setState({ user }),
      },
      fetch: () => this.userQuery.execute(userId),
      onData: (dto) => this.deps.session.setCurrentUser(dto.id),
      map: toUserView,
    });
    if (this.store.getState().user.status === 'empty') {
      this.deps.session.setCurrentUser(null);
    }
  }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS. Also `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src
git commit -m "feat(presentation): add Settings, Device, and CurrentUser slices"
```

---

### Task 16: Extension-point ViewModels (Dashboard, Teachers, Sync) + template

**Files:**

- Create: `packages/presentation/src/view-models/dashboard/dashboard-view-model.ts`
- Create: `packages/presentation/src/view-models/teachers/teachers-view-model.ts`
- Create: `packages/presentation/src/view-models/sync/sync-view-model.ts`
- Create: `packages/presentation/src/view-models/_extension-template/README.md`
- Test: `packages/presentation/src/view-models/extension-stubs.test.ts`

**Interfaces:**

- Consumes: `NotImplementedPresentationError` (Task 3), `AsyncState`/`idleState` (Task 2), `ConnectivityStore` + `presentSyncStatus` (Tasks 9–10).
- Produces:
  - `DashboardSummaryView { totalStudents: number; presentToday: number; pendingGrades: number }`, `DashboardState { summary: AsyncState<DashboardSummaryView> }`, `class DashboardViewModel { store; loadSummary(): Promise<void> /* throws NotImplementedPresentationError('Dashboard') */ }`
  - `TeacherRowView { id: string; fullName: string; position: string }`, `TeachersState { list: AsyncState<readonly TeacherRowView[]> }`, `class TeachersViewModel { store; loadTeachers(): Promise<void> /* throws NotImplementedPresentationError('Teachers') */ }`
  - `class SyncViewModel { constructor(connectivity: ConnectivityStore); get store(); statusPresentation(): StatusPresentation; startSync(): Promise<void> /* throws NotImplementedPresentationError('Manual sync') */ }` — its `store` IS the ConnectivityStore's store (live state today, actions later).

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/view-models/extension-stubs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NotImplementedPresentationError } from '../errors';
import { ConnectivityStore } from '../stores/connectivity-store';
import { DashboardViewModel } from './dashboard/dashboard-view-model';
import { SyncViewModel } from './sync/sync-view-model';
import { TeachersViewModel } from './teachers/teachers-view-model';

describe('extension-point view models', () => {
  it('dashboard and teachers expose typed idle state and throw NotImplemented', () => {
    const dashboard = new DashboardViewModel();
    expect(dashboard.store.getState().summary.status).toBe('idle');
    expect(() => dashboard.loadSummary()).toThrow(NotImplementedPresentationError);

    const teachers = new TeachersViewModel();
    expect(teachers.store.getState().list.status).toBe('idle');
    expect(() => teachers.loadTeachers()).toThrow(NotImplementedPresentationError);
  });

  it('sync reflects live connectivity state but has stub actions', () => {
    const connectivity = new ConnectivityStore();
    const sync = new SyncViewModel(connectivity);
    expect(sync.statusPresentation().label).toBe('Not synced yet');
    connectivity.setSyncStatus('syncing');
    expect(sync.store.getState().syncStatus).toBe('syncing');
    expect(sync.statusPresentation().label).toBe('Syncing…');
    expect(() => sync.startSync()).toThrow(NotImplementedPresentationError);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/view-models/dashboard/dashboard-view-model.ts`:

```ts
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { NotImplementedPresentationError } from '../../errors';

/** EXTENSION POINT — no dashboard aggregate use cases exist yet (Phase 5 has
 * no count/summary queries). State shape is fixed now so the screen can be
 * scaffolded; implement loadSummary when the application layer grows summary
 * queries. See _extension-template/README.md. */
export interface DashboardSummaryView {
  readonly totalStudents: number;
  readonly presentToday: number;
  readonly pendingGrades: number;
}

export interface DashboardState {
  readonly summary: AsyncState<DashboardSummaryView>;
}

export class DashboardViewModel {
  readonly store = createStore<DashboardState>(() => ({ summary: idleState() }));

  // async so the NotImplemented signal surfaces as a rejected promise,
  // matching the Promise<void> contract a Phase-7 caller will `.catch()`.
  async loadSummary(): Promise<void> {
    throw new NotImplementedPresentationError('Dashboard');
  }
}
```

`packages/presentation/src/view-models/teachers/teachers-view-model.ts`:

```ts
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { NotImplementedPresentationError } from '../../errors';

/** EXTENSION POINT — the Teachers/Staff domain was not built in Phases 4–5.
 * Implement when the domain and application slices exist. */
export interface TeacherRowView {
  readonly id: string;
  readonly fullName: string;
  readonly position: string;
}

export interface TeachersState {
  readonly list: AsyncState<readonly TeacherRowView[]>;
}

export class TeachersViewModel {
  readonly store = createStore<TeachersState>(() => ({ list: idleState() }));

  // async so the NotImplemented signal surfaces as a rejected promise.
  async loadTeachers(): Promise<void> {
    throw new NotImplementedPresentationError('Teachers');
  }
}
```

`packages/presentation/src/view-models/sync/sync-view-model.ts`:

```ts
import { NotImplementedPresentationError } from '../../errors';
import { presentSyncStatus } from '../../presenters/present-status';
import type { StatusPresentation } from '../../presenters/status-presentation';
import type { ConnectivityStore } from '../../stores/connectivity-store';

/** EXTENSION POINT for the synchronization phase. Sync STATE is live today —
 * this ViewModel reads the shared ConnectivityStore that the future sync
 * worker will write. Only the actions are stubs. */
export class SyncViewModel {
  constructor(private readonly connectivity: ConnectivityStore) {}

  get store() {
    return this.connectivity.store;
  }

  statusPresentation(): StatusPresentation {
    const state = this.connectivity.store.getState();
    return presentSyncStatus(state.syncStatus, state.lastSyncAt);
  }

  // async so the NotImplemented signal surfaces as a rejected promise.
  async startSync(): Promise<void> {
    throw new NotImplementedPresentationError('Manual sync');
  }
}
```

`packages/presentation/src/view-models/_extension-template/README.md`:

```markdown
# Adding a new screen (ViewModel) to @nemis-desktop/presentation

Follow the Students slice as the reference implementation.

1. **Views** — `view-models/<screen>/<screen>-views.ts`: display-ready
   interfaces only (formatted strings, `StatusPresentation` badges). Never
   expose application DTOs or domain entities to React.
2. **Mapper** — `mappers/<domain>/<domain>-view-mapper.ts`: pure
   `toXxxView(dto)` functions using `formatters/` and `presenters/`.
3. **Queries** — `queries/<domain>/*.ts`: one class per read, delegating to an
   application service method.
4. **Commands** — `commands/<domain>/*.ts`: one class per action, built on
   `executeCommand` (handles notifications + error translation).
5. **ViewModel** — `view-models/<screen>/<screen>-view-model.ts`: a class with
   a vanilla Zustand store (`AsyncState` fields + `SubmissionStatus`), loading
   via `trackQuery`, actions via the command classes. Constructor-inject only
   application services and shared stores.
6. **Selectors** — `selectors/<screen>-selectors.ts`: pure functions over the
   store state (and SessionState/ConnectivityState when needed).
7. **Wire it** — add the ViewModel to `factories/create-presentation-layer.ts`
   and export the slice from `src/index.ts`.
8. **Tests** — `<screen>-view-model.test.ts` using
   `testing/create-test-application.ts` (real application layer over in-memory
   fakes). No React, no mocks of presentation code.

Until the backing domain exists, ship the ViewModel as a typed stub whose
methods throw `NotImplementedPresentationError` (see dashboard/teachers).
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src/view-models
git commit -m "feat(presentation): add extension-point ViewModels and screen template"
```

---

### Task 17: Composition root + public API

**Files:**

- Create: `packages/presentation/src/factories/create-presentation-layer.ts`
- Modify: `packages/presentation/src/index.ts` (replace the `export {}` placeholder)
- Test: `packages/presentation/src/factories/create-presentation-layer.test.ts`

**Interfaces:**

- Consumes: `ApplicationLayer` from `@nemis-desktop/application`; every store and ViewModel from Tasks 4–16.
- Produces:
  - `PresentationStores { notifications: NotificationStore; connectivity: ConnectivityStore; session: SessionStore; dialogs: DialogStore; navigation: NavigationStore }`
  - `PresentationViewModels { students; classRoster; attendance; assessments; settings; device; currentUser; dashboard; teachers; sync }`
  - `PresentationLayer { stores: PresentationStores; viewModels: PresentationViewModels }`
  - `PresentationLayerOptions { autoDismissOverrides?: Partial<Record<NotificationKind, number | null>> }`
  - `createPresentationLayer(app: ApplicationLayer, options?): PresentationLayer`
  - `src/index.ts` re-exporting the public API (everything Phase 7 needs).

- [ ] **Step 1: Write the failing test**

`packages/presentation/src/factories/create-presentation-layer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { createTestApplication } from '../testing/create-test-application';
import { createPresentationLayer } from './create-presentation-layer';

describe('createPresentationLayer', () => {
  it('wires every store and ViewModel around one shared notification store', async () => {
    const { app } = createTestApplication();
    const presentation = createPresentationLayer(app);

    expect(presentation.stores.navigation.store.getState().current.screen).toBe('dashboard');
    expect(presentation.viewModels.sync.statusPresentation().label).toBe('Not synced yet');

    const outcome = await presentation.viewModels.students.createStudent({
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
    });
    expect(outcome.ok).toBe(true);
    // the command's notification landed in the SHARED store
    const kinds = presentation.stores.notifications.store
      .getState()
      .notifications.map((n) => n.kind);
    expect(kinds).toContain('success');
  });

  it('honours notification auto-dismiss overrides', () => {
    const { app } = createTestApplication();
    const presentation = createPresentationLayer(app, {
      autoDismissOverrides: { success: 999 },
    });
    presentation.stores.notifications.success('hi');
    expect(presentation.stores.notifications.store.getState().notifications[0]?.autoDismissMs).toBe(
      999,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run packages/presentation` → FAIL.

- [ ] **Step 3: Implement**

`packages/presentation/src/factories/create-presentation-layer.ts`:

```ts
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { NotificationKind } from '../notifications/notification';
import { ConnectivityStore } from '../stores/connectivity-store';
import { DialogStore } from '../stores/dialog-store';
import { NavigationStore } from '../stores/navigation-store';
import { NotificationStore } from '../stores/notification-store';
import { SessionStore } from '../stores/session-store';
import { AssessmentsViewModel } from '../view-models/assessments/assessments-view-model';
import { AttendanceViewModel } from '../view-models/attendance/attendance-view-model';
import { ClassRosterViewModel } from '../view-models/class-roster/class-roster-view-model';
import { CurrentUserViewModel } from '../view-models/current-user/current-user-view-model';
import { DashboardViewModel } from '../view-models/dashboard/dashboard-view-model';
import { DeviceViewModel } from '../view-models/device/device-view-model';
import { SettingsViewModel } from '../view-models/settings/settings-view-model';
import { StudentsViewModel } from '../view-models/students/students-view-model';
import { SyncViewModel } from '../view-models/sync/sync-view-model';
import { TeachersViewModel } from '../view-models/teachers/teachers-view-model';

export interface PresentationStores {
  readonly notifications: NotificationStore;
  readonly connectivity: ConnectivityStore;
  readonly session: SessionStore;
  readonly dialogs: DialogStore;
  readonly navigation: NavigationStore;
}

export interface PresentationViewModels {
  readonly students: StudentsViewModel;
  readonly classRoster: ClassRosterViewModel;
  readonly attendance: AttendanceViewModel;
  readonly assessments: AssessmentsViewModel;
  readonly settings: SettingsViewModel;
  readonly device: DeviceViewModel;
  readonly currentUser: CurrentUserViewModel;
  readonly dashboard: DashboardViewModel;
  readonly teachers: TeachersViewModel;
  readonly sync: SyncViewModel;
}

export interface PresentationLayer {
  readonly stores: PresentationStores;
  readonly viewModels: PresentationViewModels;
}

export interface PresentationLayerOptions {
  readonly autoDismissOverrides?: Partial<Record<NotificationKind, number | null>>;
}

/** Composition root: the renderer (Phase 7) calls this once with the
 * application layer (later an IPC-backed structural equivalent) and binds
 * React to the returned stores and ViewModels. */
export function createPresentationLayer(
  app: ApplicationLayer,
  options?: PresentationLayerOptions,
): PresentationLayer {
  const notifications = new NotificationStore(options?.autoDismissOverrides);
  const connectivity = new ConnectivityStore(notifications);
  const session = new SessionStore();
  const dialogs = new DialogStore();
  const navigation = new NavigationStore();

  const viewModels: PresentationViewModels = {
    students: new StudentsViewModel({ students: app.students, notifications, session }),
    classRoster: new ClassRosterViewModel({ academics: app.academics, notifications }),
    attendance: new AttendanceViewModel({ attendance: app.attendance, notifications }),
    assessments: new AssessmentsViewModel({ assessments: app.assessments, notifications }),
    settings: new SettingsViewModel({
      institution: app.institution,
      infra: app.infra,
      notifications,
    }),
    device: new DeviceViewModel({ infra: app.infra, notifications, session }),
    currentUser: new CurrentUserViewModel({ identity: app.identity, session }),
    dashboard: new DashboardViewModel(),
    teachers: new TeachersViewModel(),
    sync: new SyncViewModel(connectivity),
  };

  return {
    stores: { notifications, connectivity, session, dialogs, navigation },
    viewModels,
  };
}
```

Replace `packages/presentation/src/index.ts` with:

```ts
// Public API of @nemis-desktop/presentation — the ONLY surface the React UI
// (Phase 7) imports from.

export * from './core/async-state';
export * from './core/submission';
export * from './core/async-runner';
export * from './errors';
export * from './notifications/notification';
export * from './constants/defaults';
export * from './pagination/pagination';
export * from './filters/filter-descriptor';
export * from './search/search-state';
export * from './forms/form-manager';
export * from './validators/form-validators';
export * from './formatters/format-date';
export * from './formatters/format-text';
export * from './formatters/format-marks';
export * from './presenters/status-presentation';
export * from './presenters/present-status';
export * from './navigation/route';
export * from './stores/notification-store';
export * from './stores/session-store';
export * from './stores/connectivity-store';
export * from './stores/dialog-store';
export * from './stores/navigation-store';
export * from './selectors/session-selectors';
export * from './selectors/connectivity-selectors';
export * from './selectors/students-selectors';
export * from './mappers/students/student-view-mapper';
export * from './mappers/academics/enrollment-view-mapper';
export * from './mappers/attendance/attendance-view-mapper';
export * from './mappers/assessments/assessment-view-mapper';
export * from './mappers/institution/institution-view-mapper';
export * from './mappers/infra/infra-view-mapper';
export * from './mappers/identity/user-view-mapper';
export * from './commands/students/students-command-deps';
export * from './commands/students/create-student-ui-command';
export * from './commands/students/deactivate-student-ui-command';
export * from './commands/students/link-guardian-ui-command';
export * from './commands/academics/enroll-student-ui-command';
export * from './commands/academics/withdraw-enrollment-ui-command';
export * from './commands/attendance/record-attendance-ui-command';
export * from './commands/assessments/create-assessment-ui-command';
export * from './commands/assessments/record-grade-ui-command';
export * from './commands/assessments/publish-grade-ui-command';
export * from './commands/settings/update-grading-config-ui-command';
export * from './commands/settings/update-setting-ui-command';
export * from './commands/device/register-device-ui-command';
export * from './queries/students/list-students-ui-query';
export * from './queries/students/get-student-by-id-ui-query';
export * from './queries/academics/get-class-roster-ui-query';
export * from './queries/attendance/get-attendance-ui-query';
export * from './queries/assessments/get-grades-by-student-ui-query';
export * from './queries/settings/get-institution-profile-ui-query';
export * from './queries/identity/get-user-by-id-ui-query';
export * from './view-models/students/students-views';
export * from './view-models/students/students-view-model';
export * from './view-models/class-roster/class-roster-views';
export * from './view-models/class-roster/class-roster-view-model';
export * from './view-models/attendance/attendance-views';
export * from './view-models/attendance/attendance-view-model';
export * from './view-models/assessments/assessments-views';
export * from './view-models/assessments/assessments-view-model';
export * from './view-models/settings/settings-views';
export * from './view-models/settings/settings-view-model';
export * from './view-models/device/device-views';
export * from './view-models/device/device-view-model';
export * from './view-models/current-user/current-user-views';
export * from './view-models/current-user/current-user-view-model';
export * from './view-models/dashboard/dashboard-view-model';
export * from './view-models/teachers/teachers-view-model';
export * from './view-models/sync/sync-view-model';
export * from './factories/create-presentation-layer';
```

Note: `src/testing/` is deliberately NOT exported from the public API — tests import it by relative path. If two `export *` sources ever collide on a name, resolve with an explicit named re-export (there are no collisions in the names defined by this plan — the two `GetUserByIdUiQuery`-style classes live in `queries/identity/` only).

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run packages/presentation` → PASS. Run `pnpm typecheck` → clean (catches any broken `export *` path).

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write packages/presentation
git add packages/presentation/src
git commit -m "feat(presentation): add createPresentationLayer composition root and public API"
```

---

### Task 18: Documentation + full gate

**Files:**

- Create: `docs/presentation-layer.md`
- Modify: `docs/conventions.md` (append a "Presentation Layer" section at the end)

**Interfaces:**

- Consumes: everything built in Tasks 1–17; the spec (`docs/superpowers/specs/2026-07-19-phase-6-presentation-layer-design.md`) — copy its §2 state-management decision report into the doc rather than rewriting it.
- Produces: the Phase-6 documentation and a fully green gate on the branch.

- [ ] **Step 1: Write `docs/presentation-layer.md`**

Structure it with these sections (write real prose for each; pull details from the spec and the shipped code — every claim must match the code):

1. **Overview & architecture diagram** — the layer stack (React → presentation → application → domain → repos → SQLite) and the package boundary rules (allowed/forbidden imports, ESLint guards, domain forbidden outside tests).
2. **State management decision report** — copy spec §2 (Zustand vanilla rationale: offline-first/outside-React drivers, application-layer integration, future sync, large datasets, footprint; alternatives considered table).
3. **MVVM pattern** — ViewModel = class + vanilla store + commands/queries; state shape conventions (`AsyncState` fields + `SubmissionStatus`); React binds later via `useStore(vm.store, selector)`.
4. **ViewModel catalog** — the 7 implemented ViewModels with their backing service methods (table from spec §7) and the 3 extension stubs with the reason each is stubbed.
5. **Query & command pattern** — `trackQuery` / `executeCommand` contracts (state transitions, notification policy, never-throw commands), thin per-domain UiQuery/UiCommand classes.
6. **Error handling** — the 7 `PresentationError` kinds, the `toPresentationError` mapping table (which ApplicationException maps to what, query-vs-command fallback), `userMessage` policy.
7. **Selectors** — pure-function convention, cross-store selectors (session + screen state), the shared session/connectivity selectors.
8. **Loading states** — the `AsyncState`/`ViewStatus` union, `refreshing` semantics, how offline/syncing combine via `toViewStatus`.
9. **Forms, pagination, search, notifications, dialogs, navigation** — one short subsection each describing the shipped contracts.
10. **Presenters & formatters** — badge-token policy (semantic names, UI maps to palette; no hex in presentation).
11. **Folder organization** — the tree from this plan's File Map with one-line responsibilities.
12. **Extension strategy** — point to `view-models/_extension-template/README.md`.
13. **Known limitations / debt** — client-side keyword filter (ListStudentsDto has no keyword), `NetworkUnavailableError` unmapped until IPC/REST, Phase-5 Proxy-stub business adapters still pending (Phase-7 prerequisite), sort spec (`PaginationState.sort`) not yet consumed by any application query.

- [ ] **Step 2: Append to `docs/conventions.md`**

Add a "Presentation Layer" section covering: dependency rules (and the test-only domain exception), the ViewModel/store/command/query file conventions, `AsyncState`+`SubmissionStatus` state-shape rule, notification policy (commands notify via `executeCommand`, never directly), badge-token rule, selector purity rule, and "new screens follow `view-models/_extension-template/README.md`".

- [ ] **Step 3: Full gate (ABI dance included)**

```bash
pnpm prettier --write packages/presentation docs
pnpm format:check   # expect clean (or fix)
pnpm typecheck      # expect 0 errors across all 7 projects
pnpm lint           # expect 0 errors
pnpm rebuild:node   # switch better-sqlite3 to the Node ABI for the full suite
pnpm test           # expect ALL tests green: 372 existing + all new presentation tests
pnpm rebuild:electron  # restore the Electron ABI (electron 42.7.0) for dev/packaging
```

Record the final test count. If any existing test fails, STOP and investigate — this phase must not touch existing behavior.

- [ ] **Step 4: Commit**

```bash
git add docs/presentation-layer.md docs/conventions.md
git commit -m "docs(presentation): document presentation layer architecture and conventions"
```

- [ ] **Step 5: Final review readiness**

The branch is now ready for the whole-branch review (superpowers:requesting-code-review) and, on GO, a `--no-ff` merge to `main` (superpowers:finishing-a-development-branch) — same flow as Phases 4–5. Do not merge inside this task; that is a separate decision for the human partner.

---

## Acceptance-criteria audit (map to spec)

| Criterion                                      | Where satisfied                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| UI depends only on Presentation Layer          | Structural: boundary guards (Task 1) + public API (Task 17); verifiable fully in Phase 7 |
| Presentation depends only on Application Layer | package.json deps + ESLint guard (Task 1)                                                |
| ViewModels implemented                         | Tasks 12–16                                                                              |
| State management configured                    | Zustand vanilla stores throughout (Tasks 2–16)                                           |
| Commands implemented                           | Tasks 12–15                                                                              |
| Queries implemented                            | Tasks 12–15                                                                              |
| Selectors implemented                          | Tasks 10, 12                                                                             |
| Loading states standardized                    | Task 2 (`AsyncState`/`ViewStatus`) used by every VM                                      |
| Form infrastructure prepared                   | Task 7                                                                                   |
| Pagination/search prepared                     | Task 6                                                                                   |
| Notifications prepared                         | Task 4                                                                                   |
| Error handling prepared                        | Task 3                                                                                   |
| TypeScript/ESLint/tests pass                   | Every task's gate + Task 18 full gate                                                    |
| Documentation                                  | Task 18                                                                                  |
