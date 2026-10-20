import { describe, expect, it } from 'vitest';
import {
  academicYearLabel,
  districtOptions,
  rateBarColor,
  rateColor,
  rateStatus,
} from './finance-display';

describe('rate colours', () => {
  it('text and bar colours agree at the boundaries', () => {
    expect([39, 40, 69, 70].map(rateColor)).toEqual([
      'text-error',
      'text-pending',
      'text-pending',
      'text-active',
    ]);
    expect([39, 40, 69, 70].map(rateBarColor)).toEqual([
      'bg-error',
      'bg-pending',
      'bg-pending',
      'bg-active',
    ]);
  });

  it('status badges follow the same rule', () => {
    expect([39, 40, 69, 70].map(rateStatus)).toEqual([
      'below',
      'at-risk',
      'at-risk',
      'on-track',
    ]);
  });
});

describe('academicYearLabel', () => {
  it('shows the shared year name, else a generic label', () => {
    expect(academicYearLabel('2025/2026')).toBe('2025/2026');
    expect(academicYearLabel(null)).toBe('Current academic year');
  });
});

describe('districtOptions', () => {
  it('returns id/name pairs sorted by name', () => {
    expect(
      districtOptions([
        { districtId: 'd-2', districtName: 'Owensgrove' },
        { districtId: 'd-1', districtName: 'Buchanan' },
      ]),
    ).toEqual([
      ['d-1', 'Buchanan'],
      ['d-2', 'Owensgrove'],
    ]);
  });
});
