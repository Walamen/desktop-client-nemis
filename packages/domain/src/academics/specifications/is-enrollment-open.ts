import { Specification } from '../../core';

export interface EnrollmentWindowSnapshot {
  yearIsCurrent: boolean;
  termIsCurrent: boolean;
}

export class IsEnrollmentOpen extends Specification<EnrollmentWindowSnapshot> {
  isSatisfiedBy(candidate: EnrollmentWindowSnapshot): boolean {
    return candidate.yearIsCurrent && candidate.termIsCurrent;
  }
}
