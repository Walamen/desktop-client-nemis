import { describe, expect, it, vi } from 'vitest';
import {
  actionsFor,
  countPendingDecisions,
  needsPlacement,
  notifyTransfersChanged,
  onTransfersChanged,
  splitByWhoAsked,
  toLocalTransfer,
  type LocalTransfer,
} from './transfers';

const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const PAST = '2026-10-01T00:00:00.000Z';
const FUTURE = '2026-10-10T00:00:00.000Z';
const US = 'us';

function row(over: Partial<LocalTransfer>): LocalTransfer {
  return {
    id: 'r', studentId: 's', fromInstitutionId: 'other', toInstitutionId: US,
    status: 'PENDING', initiatedBy: 'ORIGIN_SCHOOL', lapsesAt: null,
    classId: null, termId: null, toGradeLevel: null, reason: null, reviewNotes: null,
    requestedDate: null, reviewedAt: null, createdAt: null,
    studentName: null, studentNemisId: null, fromInstitutionName: null, toInstitutionName: null,
    ...over,
  };
}
const push = (o: Partial<LocalTransfer> = {}) => row({ id: 'push', fromInstitutionId: 'other', toInstitutionId: US, initiatedBy: 'ORIGIN_SCHOOL', ...o });
const pullAgainstUs = (o: Partial<LocalTransfer> = {}) => row({ id: 'pullAgainst', fromInstitutionId: US, toInstitutionId: 'other', initiatedBy: 'RECEIVING_SCHOOL', lapsesAt: FUTURE, ...o });
const ourPush = (o: Partial<LocalTransfer> = {}) => row({ id: 'ourPush', fromInstitutionId: US, toInstitutionId: 'other', initiatedBy: 'ORIGIN_SCHOOL', ...o });
const ourPull = (o: Partial<LocalTransfer> = {}) => row({ id: 'ourPull', fromInstitutionId: 'other', toInstitutionId: US, initiatedBy: 'RECEIVING_SCHOOL', lapsesAt: FUTURE, ...o });

describe('toLocalTransfer', () => {
  it('parses a minimal record with defaults', () => {
    const t = toLocalTransfer({ id: 'a', studentId: 's', fromInstitutionId: 'f', toInstitutionId: 't', status: 'PENDING' });
    expect(t).toMatchObject({ id: 'a', studentId: 's', fromInstitutionId: 'f', toInstitutionId: 't', status: 'PENDING', initiatedBy: 'ORIGIN_SCHOOL', lapsesAt: null, classId: null, termId: null, studentName: null });
  });
  it('rejects a record missing ids', () => {
    expect(toLocalTransfer({ id: 'a', studentId: 's', fromInstitutionId: 'f' })).toBeNull();
    expect(toLocalTransfer({ studentId: 's', fromInstitutionId: 'f', toInstitutionId: 't' })).toBeNull();
  });
});

describe('splitByWhoAsked', () => {
  it('sorts one row of each kind and drops unrelated', () => {
    const unrelated = row({ id: 'x', fromInstitutionId: 'a', toInstitutionId: 'b' });
    const { requestsToUs, ourRequests } = splitByWhoAsked([push(), pullAgainstUs(), ourPush(), ourPull(), unrelated], US);
    expect(requestsToUs.map((r) => r.id)).toEqual(['push', 'pullAgainst']);
    expect(ourRequests.map((r) => r.id)).toEqual(['ourPush', 'ourPull']);
  });
});

describe('countPendingDecisions', () => {
  it('excludes decided and lapsed rows', () => {
    const rows = [push(), pullAgainstUs(), push({ status: 'APPROVED' }), pullAgainstUs({ lapsesAt: PAST }), push({ status: 'REJECTED' })];
    expect(countPendingDecisions(rows, NOW)).toBe(2);
  });
});

describe('actionsFor', () => {
  it('pending push to us: approve + reject', () => expect(actionsFor(push(), US, NOW)).toEqual(['approve', 'reject']));
  it('pending pull against us: release + reject', () => expect(actionsFor(pullAgainstUs(), US, NOW)).toEqual(['release', 'reject']));
  it('lapsed pull against us: nothing', () => expect(actionsFor(pullAgainstUs({ lapsesAt: PAST }), US, NOW)).toEqual([]));
  it('our pending request: cancel', () => {
    expect(actionsFor(ourPush(), US, NOW)).toEqual(['cancel']);
    expect(actionsFor(ourPull(), US, NOW)).toEqual(['cancel']);
  });
  it('our lapsed pull: complete + withdraw', () => expect(actionsFor(ourPull({ lapsesAt: PAST }), US, NOW)).toEqual(['complete', 'withdraw']));
  it('decided: nothing', () => {
    for (const status of ['APPROVED', 'REJECTED', 'CANCELLED']) {
      expect(actionsFor(push({ status }), US, NOW)).toEqual([]);
      expect(actionsFor(ourPull({ status, lapsesAt: PAST }), US, NOW)).toEqual([]);
    }
  });
});

describe('needsPlacement', () => {
  it('true when class or term is missing', () => {
    expect(needsPlacement(row({ classId: null, termId: 't' }))).toBe(true);
    expect(needsPlacement(row({ classId: 'c', termId: null }))).toBe(true);
  });
  it('false when both present', () => expect(needsPlacement(row({ classId: 'c', termId: 't' }))).toBe(false));
});

describe('change signal', () => {
  it('notifies until unsubscribed', () => {
    const fn = vi.fn();
    const off = onTransfersChanged(fn);
    notifyTransfersChanged();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    notifyTransfersChanged();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
