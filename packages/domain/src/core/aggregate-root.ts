import { Entity } from './entity';
import type { DomainEvent } from './domain-event';

/** Concurrency metadata used by the sync/conflict layer. `deviceId` is intentionally
 * NOT here — it is infrastructure identity assigned at the sync boundary. */
export interface AggregateMetadata {
  version: number;
  updatedAt: string; // ISO-8601 UTC
  lastModifiedBy?: string;
}

export abstract class AggregateRoot<TId extends string> extends Entity<TId> {
  #events: DomainEvent[] = [];
  #metadata: AggregateMetadata;

  protected constructor(id: TId, metadata: AggregateMetadata) {
    super(id);
    this.#metadata = { ...metadata };
  }

  get version(): number {
    return this.#metadata.version;
  }

  get updatedAt(): string {
    return this.#metadata.updatedAt;
  }

  get lastModifiedBy(): string | undefined {
    return this.#metadata.lastModifiedBy;
  }

  protected addEvent(event: DomainEvent): void {
    this.#events.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const drained = this.#events;
    this.#events = [];
    return drained;
  }

  /** Advance concurrency metadata after a state change. `at` is injected (no clock
   * side-effect in the domain); callers pass an ISO timestamp. */
  protected touch(by?: string, at: string = new Date().toISOString()): void {
    this.#metadata = {
      version: this.#metadata.version + 1,
      updatedAt: at,
      lastModifiedBy: by ?? this.#metadata.lastModifiedBy,
    };
  }
}
