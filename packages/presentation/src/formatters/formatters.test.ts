import { describe, expect, it } from 'vitest';
import { GradeLevel } from '@nemis-desktop/types';
import { formatIsoDate, formatIsoDateTime } from './format-date';
import { formatFullName, formatGradeLevel, humanizeEnum } from './format-text';
import { formatMarks, formatPercent } from './format-marks';

describe('formatters', () => {
  it('formats ISO dates and datetimes in UTC', () => {
    expect(formatIsoDate('2026-07-19')).toBe('19 Jul 2026');
    expect(formatIsoDateTime('2026-07-19T12:00:00.000Z')).toBe('19 Jul 2026, 12:00');
    expect(formatIsoDate('garbage')).toBe('—');
    expect(formatIsoDateTime('garbage')).toBe('—');
  });

  it('formats names', () => {
    expect(formatFullName('Ada', 'Lovelace')).toBe('Ada Lovelace');
    expect(formatFullName('Ada', 'Lovelace', 'King')).toBe('Ada King Lovelace');
  });

  it('humanizes enum values', () => {
    expect(humanizeEnum('UNDER_REVIEW')).toBe('Under review');
    expect(humanizeEnum('PRESENT')).toBe('Present');
  });

  it('formats grade levels', () => {
    expect(formatGradeLevel(GradeLevel.GRADE_1)).toBe('Grade 1');
    expect(formatGradeLevel(GradeLevel.KG)).toBe('KG');
    expect(formatGradeLevel(undefined)).toBe('—');
  });

  it('formats marks and percentages', () => {
    expect(formatMarks(45, 100)).toBe('45 / 100');
    expect(formatPercent(45, 100)).toBe('45%');
    expect(formatPercent(1, 3)).toBe('33%');
    expect(formatPercent(1, 0)).toBe('—');
  });
});
