import { describe, expect, it } from 'vitest';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { Institution } from './entities/institution';
import { GradingConfig } from './entities/grading-config';
import { SchoolCode } from './value-objects/school-code';
import { IsInstitutionApproved } from './specifications/is-institution-approved';
import {
  EntityValidationException,
  InvalidStateException,
  InvalidValueObjectException,
} from '../exceptions';

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

  it('rejects a pending institution', () => {
    const inst = pending();
    inst.reject('incomplete docs', 'ministry', ISO);
    expect(inst.approvalStatus).toBe(ApprovalStatus.REJECTED);
    expect(inst.isApproved).toBe(false);
    expect(inst.version).toBe(2);
  });

  it('cannot reject an already-rejected institution', () => {
    const inst = pending();
    inst.reject('incomplete docs', 'ministry', ISO);
    expect(() => inst.reject('incomplete docs', 'ministry', ISO)).toThrow(InvalidStateException);
  });

  it('reconstitutes from persisted state without emitting events', () => {
    const inst = Institution.reconstitute({
      id: 'inst-1',
      code: 'LR-MON-001',
      name: 'Monrovia Central High',
      type: InstitutionType.SCHOOL,
      ownership: OwnershipType.GOVERNMENT,
      countyId: 'county-1',
      approvalStatus: ApprovalStatus.APPROVED,
      version: 5,
      updatedAt: ISO,
    });
    expect(inst.isApproved).toBe(true);
    expect(inst.version).toBe(5);
    expect(inst.pullDomainEvents()).toHaveLength(0);
  });
});

describe('GradingConfig', () => {
  it('rejects passingMarks greater than maxMarks', () => {
    expect(() =>
      GradingConfig.reconstitute({
        id: 'gc-1',
        maxMarks: 50,
        passingMarks: 60,
        requireAdminApproval: true,
      }),
    ).toThrow(EntityValidationException);
  });

  it('constructs and exposes getters when valid', () => {
    const config = GradingConfig.reconstitute({
      id: 'gc-1',
      maxMarks: 100,
      passingMarks: 50,
      requireAdminApproval: true,
    });
    expect(config.maxMarks).toBe(100);
    expect(config.passingMarks).toBe(50);
    expect(config.requireAdminApproval).toBe(true);
  });
});

describe('IsInstitutionApproved', () => {
  it('is satisfied only for APPROVED', () => {
    const spec = new IsInstitutionApproved();
    expect(spec.isSatisfiedBy({ approvalStatus: ApprovalStatus.APPROVED })).toBe(true);
    expect(spec.isSatisfiedBy({ approvalStatus: ApprovalStatus.PENDING })).toBe(false);
  });
});
