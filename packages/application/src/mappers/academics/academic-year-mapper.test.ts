import { describe, expect, it } from 'vitest';
import { AcademicYear } from '@nemis-desktop/domain';
import { toAcademicYearOutput } from './academic-year-mapper';

describe('toAcademicYearOutput', () => {
  it('maps a domain academic year to the output DTO', () => {
    const year = AcademicYear.reconstitute({
      id: 'ay-1',
      institutionId: 'inst-1',
      code: '2025/2026',
      start: '2025-09-01',
      end: '2026-07-31',
      isCurrent: true,
      version: 1,
      updatedAt: '2026-07-20T00:00:00.000Z',
    });
    expect(toAcademicYearOutput(year)).toEqual({
      id: 'ay-1',
      institutionId: 'inst-1',
      code: '2025/2026',
      startDate: '2025-09-01',
      endDate: '2026-07-31',
      isCurrent: true,
    });
  });
});
