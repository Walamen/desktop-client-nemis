import { describe, expect, it } from 'vitest';
import { AllowAllPermissionEvaluator } from './allow-all-permission-evaluator';
import { CryptoIdGenerator } from './crypto-id-generator';
import { NoopEventPublisher } from './noop-event-publisher';
import { SystemClock } from './system-clock';

describe('default port implementations', () => {
  it('SystemClock returns an ISO string', () => {
    const iso = new SystemClock().now();
    expect(new Date(iso).toISOString()).toBe(iso);
  });

  it('CryptoIdGenerator returns distinct non-empty ids', () => {
    const gen = new CryptoIdGenerator();
    const a = gen.next();
    const b = gen.next();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('NoopEventPublisher does nothing and does not throw', () => {
    expect(() =>
      new NoopEventPublisher().publish({ name: 'X', occurredAt: '2026-01-01T00:00:00.000Z' }),
    ).not.toThrow();
  });

  it('AllowAllPermissionEvaluator allows everything', () => {
    expect(new AllowAllPermissionEvaluator().evaluate({ action: 'students:create' })).toEqual({
      allowed: true,
    });
  });
});
