import { describe, expect, it } from 'vitest';
import { Money } from './money';
import { Percentage } from './percentage';
import { Marks } from './marks';
import { InvalidValueObjectException } from '../exceptions';

describe('Money', () => {
  it('defaults to LRD and adds same currency', () => {
    const a = Money.create({ amount: 100 });
    expect(a.currency).toBe('LRD');
    expect(a.add(Money.create({ amount: 50 })).amount).toBe(150);
  });

  it('rejects negative amounts and cross-currency addition', () => {
    expect(() => Money.create({ amount: -1 })).toThrow(InvalidValueObjectException);
    expect(() =>
      Money.create({ amount: 1, currency: 'USD' }).add(Money.create({ amount: 1 })),
    ).toThrow(InvalidValueObjectException);
  });
});

describe('Percentage', () => {
  it('accepts 0-100 and rejects out of range', () => {
    expect(Percentage.create(72).value).toBe(72);
    expect(() => Percentage.create(101)).toThrow(InvalidValueObjectException);
  });
});

describe('Marks', () => {
  it('computes percentage and rejects obtained > total', () => {
    const marks = Marks.create({ obtained: 45, total: 60 });
    expect(marks.percentage.value).toBe(75);
    expect(() => Marks.create({ obtained: 70, total: 60 })).toThrow(InvalidValueObjectException);
  });

  it('rejects NaN obtained', () => {
    expect(() => Marks.create({ obtained: NaN, total: 50 })).toThrow(InvalidValueObjectException);
  });

  it('rejects NaN total', () => {
    expect(() => Marks.create({ obtained: 10, total: NaN })).toThrow(InvalidValueObjectException);
  });

  it('rejects a zero total', () => {
    expect(() => Marks.create({ obtained: 10, total: 0 })).toThrow(InvalidValueObjectException);
  });
});
