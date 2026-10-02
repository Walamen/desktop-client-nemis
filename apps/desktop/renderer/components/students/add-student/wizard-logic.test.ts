import { describe, expect, it } from 'vitest';
import { GradeLevel, type RegistryHit } from '@nemis-desktop/types';
import { branchForLookup, claimGradeDefault, claimNeedsReason, describeCompletion } from './wizard-logic';

const hit = (over: Partial<RegistryHit> = {}): RegistryHit => ({
  found: true, nemisId: '482915736045', firstName: 'Musu', lastName: 'Kollie', gender: 'FEMALE' as never,
  lastCompletion: { gradeLevel: GradeLevel.GRADE_6, outcome: 'PROMOTED', nextGradeLevel: GradeLevel.GRADE_7, academicYearName: '2025/2026' },
  claimPath: 'IMMEDIATE', ...over,
});

describe('wizard logic', () => {
  it('routes lookup results to branches', () => {
    expect(branchForLookup({ found: false })).toBe('miss');
    expect(branchForLookup(hit())).toBe('claim');
    expect(branchForLookup(hit({ claimPath: 'REQUIRES_APPROVAL' }))).toBe('request');
  });

  it('pre-fills the stamped next grade, but never a null one', () => {
    expect(claimGradeDefault(hit())).toBe(GradeLevel.GRADE_7);
    expect(claimGradeDefault(hit({ lastCompletion: { gradeLevel: GradeLevel.GRADE_12, outcome: 'GRADUATED', nextGradeLevel: null, academicYearName: '2025/2026' } }))).toBe('');
    expect(claimGradeDefault(hit({ lastCompletion: null }))).toBe('');
  });

  it('requires a reason when the grade differs from the stamp, and always after GRADUATED', () => {
    expect(claimNeedsReason(hit(), GradeLevel.GRADE_7)).toBe(false);
    expect(claimNeedsReason(hit(), GradeLevel.GRADE_8)).toBe(true);
    const graduated = hit({ lastCompletion: { gradeLevel: GradeLevel.GRADE_12, outcome: 'GRADUATED', nextGradeLevel: null, academicYearName: '2025/2026' } });
    expect(claimNeedsReason(graduated, GradeLevel.GRADE_12)).toBe(true);
    expect(claimNeedsReason(graduated, '')).toBe(true);
  });

  it('describes the last completion for the admin', () => {
    // shared.tsx's human() only swaps '_' for ' ' and upper-cases word starts,
    // so 'GRADE_6' renders as 'GRADE 6' (the same label the grade grid shows).
    expect(describeCompletion(hit())).toBe('GRADE 6 — Promoted to GRADE 7 (2025/2026)');
    expect(describeCompletion(hit({ lastCompletion: { gradeLevel: GradeLevel.GRADE_12, outcome: 'GRADUATED', nextGradeLevel: null, academicYearName: '2025/2026' } }))).toBe('GRADE 12 — Graduated (2025/2026)');
    expect(describeCompletion(hit({ lastCompletion: null }))).toBeNull();
  });
});
