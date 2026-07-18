import { describe, expect, it } from 'vitest';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { Institution } from './entities/institution';
import { SchoolCode } from './value-objects/school-code';
import { IsInstitutionApproved } from './specifications/is-institution-approved';
import { InvalidStateException, InvalidValueObjectException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

function pending(): Institution {
  return Institution.create({
    id: 'inst-1',
    code: 'LR-MON-001',
    name: 'Monrovia Central High',
    type: InstitutionType.SCHOOL,
    ownership: OwnershipType.GOVERNMENT,
    countyId: 'county-1',
    occurredAt: ISO,
  });
}

describe('SchoolCode', () => {
  it('uppercases and rejects empty', () => {
    expect(SchoolCode.create('lr-mon-001').value).toBe('LR-MON-001');
    expect(() => SchoolCode.create('  ')).toThrow(InvalidValueObjectException);
  });
});

describe('Institution', () => {
  it('starts PENDING and approves', () => {
    const inst = pending();
    expect(inst.isApproved).toBe(false);
    inst.approve('ministry', ISO);
    expect(inst.approvalStatus).toBe(ApprovalStatus.APPROVED);
    expect(inst.isApproved).toBe(true);
    expect(inst.version).toBe(2);
  });

  it('cannot approve an already-approved institution', () => {
    const inst = pending();
    inst.approve('ministry', ISO);
    expect(() => inst.approve('ministry', ISO)).toThrow(InvalidStateException);
  });
});

describe('IsInstitutionApproved', () => {
  it('is satisfied only for APPROVED', () => {
    const spec = new IsInstitutionApproved();
    expect(spec.isSatisfiedBy({ approvalStatus: ApprovalStatus.APPROVED })).toBe(true);
    expect(spec.isSatisfiedBy({ approvalStatus: ApprovalStatus.PENDING })).toBe(false);
  });
});
