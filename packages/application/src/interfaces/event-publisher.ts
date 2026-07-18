/** An application-level event emitted after a command's state change succeeds. */
export interface ApplicationEvent {
  readonly name: string;
  readonly occurredAt: string; // ISO-8601 UTC
}

/** No event bus is built this phase; the default publisher is a no-op. */
export interface IEventPublisher {
  publish(event: ApplicationEvent): void;
}
