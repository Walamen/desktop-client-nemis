import { describe, expect, it, vi } from 'vitest';
import type { IpcChannel } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import type { GradeCompletionService } from '@app/data/services/GradeCompletionService';
import { registerGradeCompletionHandlers } from './gradeCompletions';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function register() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const service = {
    getCohort: vi.fn(() => ({ rows: [], unenrolledCount: 2 })),
    save: vi.fn(() => ({ saved: 1 })),
    discard: vi.fn(() => ({ discarded: true })),
  };
  registerGradeCompletionHandlers(handle, service as unknown as GradeCompletionService);
  return { calls, service };
}

describe('grade-completion IPC handlers', () => {
  it('validates and forwards the cohort read', async () => {
    const { calls, service } = register();
    const cohort = calls.get('grade-completion:cohort')!;
    expect(() => cohort.validate(['y1', 'GRADE_7'])).not.toThrow();
    expect(() => cohort.validate(['y1'])).toThrow();
    expect(() => cohort.validate(['', 'GRADE_7'])).toThrow();
    expect(() => cohort.validate(['y1', 'GRADE_99'])).toThrow();
    expect(await cohort.handler('y1', 'GRADE_7')).toEqual({ rows: [], unenrolledCount: 2 });
    expect(service.getCohort).toHaveBeenCalledWith('y1', 'GRADE_7');
  });

  it('validates the save request, including the decision shape, and forwards it', async () => {
    const { calls, service } = register();
    const save = calls.get('grade-completion:save')!;
    const request = {
      academicYearId: 'y1',
      gradeLevel: 'GRADE_7',
      decisions: [
        { studentId: 's1', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_8', notes: 'Good' },
        { studentId: 's2', outcome: 'GRADUATED' },
      ],
    };
    expect(() => save.validate([request])).not.toThrow();
    const withDecision = (decision: Record<string, unknown>) => [
      { ...request, decisions: [decision] },
    ];
    expect(() => save.validate(withDecision({ studentId: 's2', outcome: 'GRADUATED', nextGradeLevel: 'GRADE_8' }))).toThrow(
      /GRADUATED outcome must not carry a next grade/,
    );
    expect(() => save.validate(withDecision({ studentId: 's1', outcome: 'RETAINED' }))).toThrow(
      /next grade is required/,
    );
    expect(() => save.validate(withDecision({ studentId: 's1', outcome: 'PASSED', nextGradeLevel: 'GRADE_8' }))).toThrow();
    expect(() => save.validate(withDecision({ studentId: 's1', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_8', extra: 1 }))).toThrow();
    expect(() => save.validate([{ ...request, decisions: 'all' }])).toThrow();
    expect(() => save.validate([{ ...request, gradeLevel: 'GRADE_99' }])).toThrow();
    expect(() => save.validate([{ ...request, extra: true }])).toThrow();
    expect(await save.handler(request)).toEqual({ saved: 1 });
    expect(service.save).toHaveBeenCalledWith(request);
  });

  it('validates and forwards a discard', async () => {
    const { calls, service } = register();
    const discard = calls.get('grade-completion:discard')!;
    expect(() => discard.validate(['y1', 's1'])).not.toThrow();
    expect(() => discard.validate(['y1'])).toThrow();
    expect(() => discard.validate(['', 's1'])).toThrow();
    expect(() => discard.validate(['y1', ''])).toThrow();
    expect(() => discard.validate(['y1', 7])).toThrow();
    expect(await discard.handler('y1', 's1')).toEqual({ discarded: true });
    expect(service.discard).toHaveBeenCalledWith('y1', 's1');
  });
});
