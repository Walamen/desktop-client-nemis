# Adding an application use case / domain slice

The application layer follows one shape for every feature. To add a use case:

1. **Port** — add/extend a repository port in `interfaces/<domain>/` that speaks in
   domain entities (never rows, never DTOs). If a cross-cutting need arises, extend the
   ports in `interfaces/` (unit-of-work, clock, id-generator, event-publisher, logger).
2. **DTOs** — add Input/Output DTOs in `dto/<domain>/`. Never expose entities or rows.
3. **Mapper** — add entity → Output mapping in `mappers/<domain>/`.
4. **Use case** — add a `CommandHandler`/`QueryHandler` in `use-cases/<domain>/`. Wrap the
   body in `invokeUseCase(name, logger, async () => { … })`. Commands validate → check
   preconditions via ports → call the domain factory/method → persist inside
   `unitOfWork.run(() => repo.save(entity))` → publish an event → map to Output. Queries
   read via ports and map; they never take a unit of work and never publish events.
5. **Event** — only if a command needs one, add it to `events/<domain>.ts`. Do NOT declare
   events for use cases that do not exist.
6. **Service** — optionally add a façade in `services/` grouping the domain's use cases.
7. **Wire** — register the use case in `factories/create-application-layer.ts`.
8. **Test** — colocate `*.test.ts` using the in-memory fakes in `testing/`.

## Not-yet-built domains (no domain entities exist — do NOT invent behavior)

`geography`, `staff`, `finance`, `communication`, `resources`, `reporting`.

Examples that belong to `staff` once its domain slice ships: `CreateTeacher`,
`AssignTeacher`. When the `staff` aggregate exists, the assignment command would emit a
`TeacherAssigned` event — declared only then. Example (do not enable until the entity exists):

    // events/staff.ts (FUTURE — only when the staff domain is built)
    // export interface TeacherAssigned extends ApplicationEvent {
    //   readonly name: 'TeacherAssigned';
    //   readonly teacherId: string;
    //   readonly classId: string;
    // }
