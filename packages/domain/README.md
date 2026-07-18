# @nemis-desktop/domain

Pure-TypeScript domain layer for the NEMIS desktop client. Mirrors the production
business model (backend `@nemis/*` Prisma schema) with **zero infrastructure
dependencies**.

## Philosophy

Rich domain models: entities carry behavior and enforce their own invariants; value
objects are immutable and self-validating; specifications capture reusable business
rules; domain events are defined (not dispatched) and drained via
`pullDomainEvents()`. No anemic models, no business logic in UI/SQLite/repositories.

## Dependency rule

The only permitted dependency is `@nemis-desktop/types` (enums + contracts). Imports
of `electron`, `react`, `next`, `better-sqlite3`, `@nemis-desktop/shared`, or any
`database/`/`data/`/`ipc/` path are banned and enforced by ESLint
(`no-restricted-imports`). The package compiles standalone:
`pnpm --filter @nemis-desktop/domain typecheck`.

## Layout

- `core/` — kernel: `Entity`, `AggregateRoot`, `ValueObject`, `DomainEvent`,
  `Specification`, `guard`, branded `EntityId`.
- `exceptions/` — `DomainException` hierarchy.
- `value-objects/` — cross-cutting VOs (name, email, phone, money, marks, …).
- `<domain>/` — one folder per business domain (entities / value-objects /
  specifications / events).
- `_extension-template/` — recipe for adding the remaining domains.

## Built this phase (vertical slice)

identity, institution, students, academics, attendance, assessments. The remaining
six domains are discovery-complete (see the Phase 4 spec) and added via the recipe.

## Intentional divergences from the production schema

- **RefreshToken / ActivationToken** are excluded — authentication infrastructure,
  not business domain.
- **Feature-first layout** instead of the spec's flat technical-first folders (66
  entities make one flat folder unmaintainable).
- **Enums are re-declared** in `@nemis-desktop/types` (separate pnpm workspace can't
  import backend `@nemis/types`); backend remains the single source of truth.
- **Wide profile fields** (e.g. `Institution`'s ~50 infrastructure booleans) are
  carried as an opaque `profile` record rather than individually invariant-checked.
- **`deviceId`** is not modeled in the domain — it is sync-layer infrastructure.
  Concurrency metadata (`version`, `updatedAt`, `lastModifiedBy`) IS modeled on
  `AggregateRoot`.
