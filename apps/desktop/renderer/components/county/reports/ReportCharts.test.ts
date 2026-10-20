import { describe, expect, it } from 'vitest';
import { gradeLevelOrder } from './ReportCharts';

describe('gradeLevelOrder', () => {
  it('sorts KG, K1, K2, grades 1–12, then others, UNKNOWN last', () => {
    const levels = ['GRADE_10', 'UNKNOWN', 'K1', 'GRADE_2', 'KG', 'K2', 'GRADE_1'];
    expect([...levels].sort((a, b) => gradeLevelOrder(a) - gradeLevelOrder(b))).toEqual([
      'KG',
      'K1',
      'K2',
      'GRADE_1',
      'GRADE_2',
      'GRADE_10',
      'UNKNOWN',
    ]);
  });
});
