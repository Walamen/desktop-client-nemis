import { describe, expect, it } from 'vitest';
import { ValueObject } from './value-object';
import { guard } from './guard';
import { InvalidValueObjectException } from '../exceptions';

interface CodeProps {
  value: string;
}
class Code extends ValueObject<CodeProps> {
  constructor(value: string) {
    super({ value });
  }
  get value(): string {
    return this.props.value;
  }
}

describe('ValueObject', () => {
  it('is frozen and equal by structure', () => {
    const a = new Code('X');
    expect(Object.isFrozen((a as unknown as { props: object }).props)).toBe(true);
    expect(a.equals(new Code('X'))).toBe(true);
    expect(a.equals(new Code('Y'))).toBe(false);
    expect(a.equals(undefined)).toBe(false);
  });
});

describe('guard', () => {
  it('againstEmpty rejects blank and returns trimmed value', () => {
    expect(guard.againstEmpty('  hi ', 'name')).toBe('hi');
    expect(() => guard.againstEmpty('   ', 'name')).toThrow(InvalidValueObjectException);
  });

  it('range enforces inclusive bounds', () => {
    expect(guard.range(5, 0, 10, 'score')).toBe(5);
    expect(() => guard.range(11, 0, 10, 'score')).toThrow(InvalidValueObjectException);
  });

  it('iso validates a timestamp and notFuture rejects tomorrow', () => {
    expect(guard.iso('2026-07-17T00:00:00.000Z', 'date')).toBe('2026-07-17T00:00:00.000Z');
    expect(() => guard.iso('nonsense', 'date')).toThrow(InvalidValueObjectException);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect(() => guard.notFuture(tomorrow, 'date')).toThrow(InvalidValueObjectException);
  });
});
