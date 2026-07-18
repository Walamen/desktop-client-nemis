import { describe, expect, it } from 'vitest';
import { Address } from './address';
import { GpsLocation } from './gps-location';
import { DateRange } from './date-range';
import { DateOfBirth } from './date-of-birth';
import { InvalidValueObjectException } from '../exceptions';

describe('Address', () => {
  it('reports empty when no parts', () => {
    expect(Address.create({}).isEmpty).toBe(true);
    expect(Address.create({ communityTown: 'Gbarnga' }).isEmpty).toBe(false);
  });
});

describe('GpsLocation', () => {
  it('validates coordinate bounds', () => {
    const loc = GpsLocation.create({ latitude: 6.3, longitude: -10.8 });
    expect(loc.latitude).toBe(6.3);
    expect(() => GpsLocation.create({ latitude: 200, longitude: 0 })).toThrow(
      InvalidValueObjectException,
    );
  });
});

describe('DateRange', () => {
  it('enforces start <= end and contains()', () => {
    const range = DateRange.create({ start: '2026-01-01', end: '2026-12-31' });
    expect(range.contains('2026-06-01')).toBe(true);
    expect(range.contains('2027-01-01')).toBe(false);
    expect(() => DateRange.create({ start: '2026-12-31', end: '2026-01-01' })).toThrow(
      InvalidValueObjectException,
    );
  });
});

describe('DateOfBirth', () => {
  it('computes age and rejects future dates', () => {
    const dob = DateOfBirth.create('2010-07-17');
    expect(dob.ageOn('2026-07-17')).toBe(16);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect(() => DateOfBirth.create(tomorrow)).toThrow(InvalidValueObjectException);
  });
});
