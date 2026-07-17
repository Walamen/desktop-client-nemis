import { describe, expect, it } from 'vitest';
import { AggregateRoot } from './aggregate-root';
import type { AggregateMetadata } from './aggregate-root';
import { Entity } from './entity';
import type { DomainEvent } from './domain-event';
import { isUuid } from './identifier';
import { Specification } from './specification';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

class Widget extends Entity<string> {
  constructor(id: string) {
    super(id);
  }
}

interface CounterEvent extends DomainEvent {
  readonly name: 'Counted';
}

class Counter extends AggregateRoot<string> {
  constructor(id: string, meta: AggregateMetadata) {
    super(id, meta);
  }
  bump(by: string): void {
    this.touch(by, '2026-07-17T00:00:00.000Z');
    const event: CounterEvent = {
      name: 'Counted',
      aggregateId: this.id,
      occurredAt: '2026-07-17T00:00:00.000Z',
    };
    this.addEvent(event);
  }
}

class AlwaysTrue extends Specification<number> {
  isSatisfiedBy(): boolean {
    return true;
  }
}
class GreaterThan extends Specification<number> {
  constructor(private readonly min: number) {
    super();
  }
  isSatisfiedBy(c: number): boolean {
    return c > this.min;
  }
}

describe('isUuid', () => {
  it('accepts a valid uuid and rejects junk', () => {
    expect(isUuid(VALID_UUID)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});

describe('Entity', () => {
  it('is equal by id and type, not reference', () => {
    expect(new Widget('a').equals(new Widget('a'))).toBe(true);
    expect(new Widget('a').equals(new Widget('b'))).toBe(false);
    expect(new Widget('a').equals(undefined)).toBe(false);
  });
});

describe('AggregateRoot', () => {
  it('touch bumps version and updatedAt; events drain once', () => {
    const c = new Counter('id', { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' });
    c.bump('user-1');
    expect(c.version).toBe(2);
    expect(c.updatedAt).toBe('2026-07-17T00:00:00.000Z');
    expect(c.lastModifiedBy).toBe('user-1');

    const first = c.pullDomainEvents();
    expect(first).toHaveLength(1);
    expect(first[0]?.name).toBe('Counted');
    expect(c.pullDomainEvents()).toHaveLength(0);
  });
});

describe('Specification', () => {
  it('composes with and/or/not', () => {
    const gt5 = new GreaterThan(5);
    expect(gt5.and(new AlwaysTrue()).isSatisfiedBy(6)).toBe(true);
    expect(gt5.and(new AlwaysTrue()).isSatisfiedBy(4)).toBe(false);
    expect(gt5.or(new AlwaysTrue()).isSatisfiedBy(4)).toBe(true);
    expect(gt5.not().isSatisfiedBy(4)).toBe(true);
  });
});
