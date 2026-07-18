# Adding a new domain (extension recipe)

The six built domains (identity, institution, students, academics, attendance,
assessments) are the reference implementation. To add one of the remaining domains
(geography, staff, finance, communication, resources, reporting), follow this recipe.

1. **Create the folder** `packages/domain/src/<domain>/` with `entities/`,
   `value-objects/` (only if the domain needs new ones), `specifications/`,
   `events/`, and `index.ts`.
2. **Mirror any missing enums** into `@nemis-desktop/types/src/enums.ts` first
   (values verbatim from `schema.prisma`), then import them here.
3. **Model each entity** with a private constructor + static `create()` (new,
   enforces invariants, may emit a creation event) and `reconstitute()` (rehydrate
   from persistence, no event). Aggregate roots extend `AggregateRoot`; child
   entities extend `Entity`.
4. **Put behavior on the entity** (e.g. `payment.reverse(reason, by, at)`), never
   in a service. Mutations call `this.touch(by, at)` and, where meaningful,
   `this.addEvent(...)`.
5. **Reuse the cross-cutting value objects** (`Money`, `PersonName`, `DateRange`, …)
   before writing new ones. New domain-specific VOs live under the domain's
   `value-objects/`.
6. **Write specifications** for reusable business rules only — no workflows.
7. **Add tests** beside each source file (`*.test.ts`) covering happy path + each
   invariant/transition.
8. **Export** from the domain `index.ts`, then from `packages/domain/src/index.ts`.
9. **Verify**: `pnpm --filter @nemis-desktop/domain typecheck && pnpm test && pnpm lint`.
