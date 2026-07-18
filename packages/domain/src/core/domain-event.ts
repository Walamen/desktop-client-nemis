/** Immutable record of something that happened to an aggregate. Definition only —
 * the domain never dispatches events. Callers drain via pullDomainEvents(). */
export interface DomainEvent {
  readonly name: string;
  readonly aggregateId: string;
  readonly occurredAt: string; // ISO-8601 UTC
}
