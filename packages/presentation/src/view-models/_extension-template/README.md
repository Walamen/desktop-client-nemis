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
