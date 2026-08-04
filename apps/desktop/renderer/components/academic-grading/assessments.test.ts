import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listAssessmentsForPeriod,
  listTemplatesForSubject,
  materializeAssessment,
  toAssessmentTemplateRow,
  totalWeight,
  weightedPercentage,
} from './assessments';

function installMock(collections: Record<string, unknown[]>) {
  (window as unknown as { nemis: unknown }).nemis = {
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => ({
        items: collections[request.collection] ?? [],
        total: (collections[request.collection] ?? []).length,
      })),
      save: vi.fn(async (request: { collection: string; record: Record<string, unknown> }) => ({
        id: 'generated-id',
        ...request.record,
      })),
    },
  };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('toAssessmentTemplateRow', () => {
  it('maps a raw record, defaulting a missing weight to null', () => {
    const row = toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: null, date: '2026-02-01' });
    expect(row).toEqual({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: null, date: '2026-02-01' });
  });
});

describe('listTemplatesForSubject', () => {
  it('filters the class+subject client-side, matching listPeriodsForTerm\'s pattern', async () => {
    installMock({
      assessment_templates: [
        { id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' },
        { id: 't2', classId: 'c1', subjectId: 's2', name: 'Not this subject', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' },
      ],
    });
    const rows = await listTemplatesForSubject('c1', 's1');
    expect(rows.map((r) => r.id)).toEqual(['t1']);
  });
});

describe('listAssessmentsForPeriod', () => {
  it('filters by class+subject+gradingPeriodId', async () => {
    installMock({
      assessments: [
        { id: 'a1', templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p1' },
        { id: 'a2', templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p2' },
      ],
    });
    const rows = await listAssessmentsForPeriod('c1', 's1', 'p1');
    expect(rows.map((r) => r.id)).toEqual(['a1']);
  });
});

describe('materializeAssessment', () => {
  it('returns the existing assessment id when one already exists for this template+period', async () => {
    installMock({
      assessments: [{ id: 'existing-1', templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p1' }],
    });
    const template = toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' });
    const id = await materializeAssessment(template, 'p1');
    expect(id).toBe('existing-1');
    const nemis = (window as unknown as { nemis: { schoolAdmin: { save: ReturnType<typeof vi.fn> } } }).nemis;
    expect(nemis.schoolAdmin.save).not.toHaveBeenCalled();
  });

  it('creates a new assessment instance when none exists yet', async () => {
    installMock({ assessments: [] });
    const template = toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' });
    const id = await materializeAssessment(template, 'p1');
    expect(id).toBe('generated-id');
    const nemis = (window as unknown as { nemis: { schoolAdmin: { save: ReturnType<typeof vi.fn> } } }).nemis;
    expect(nemis.schoolAdmin.save).toHaveBeenCalledWith({
      collection: 'assessments',
      record: { templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' },
    });
  });
});

describe('weightedPercentage', () => {
  const templates = [
    toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz', type: 'QUIZ', totalMarks: 20, weight: 40, date: '2026-02-01' }),
    toAssessmentTemplateRow({ id: 't2', classId: 'c1', subjectId: 's1', name: 'Test', type: 'TEST', totalMarks: 50, weight: 60, date: '2026-02-01' }),
  ];

  it('computes the sum of (score/totalMarks * weight) across templates', () => {
    const scores = new Map([['t1', 16], ['t2', 40]]); // 16/20*40=32, 40/50*60=48 -> 80
    expect(weightedPercentage(scores, templates)).toBe(80);
  });

  it('returns null when no scores are entered', () => {
    expect(weightedPercentage(new Map(), templates)).toBeNull();
  });

  it('skips templates with no score entered rather than treating them as zero', () => {
    const scores = new Map([['t1', 20]]); // only t1 scored: 20/20*40 = 40
    expect(weightedPercentage(scores, templates)).toBe(40);
  });
});

describe('totalWeight', () => {
  it('sums weight across templates, treating null as 0', () => {
    const templates = [
      toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz', type: 'QUIZ', totalMarks: 20, weight: 40, date: '2026-02-01' }),
      toAssessmentTemplateRow({ id: 't2', classId: 'c1', subjectId: 's1', name: 'Test', type: 'TEST', totalMarks: 50, weight: null, date: '2026-02-01' }),
    ];
    expect(totalWeight(templates)).toBe(40);
  });
});
