import { Specification } from '../../core';
import { GradeStatus } from '@nemis-desktop/types';

export interface GradePublishContext {
  status: GradeStatus;
  windowOpen: boolean;
}

const PUBLISHABLE: ReadonlySet<GradeStatus> = new Set([
  GradeStatus.APPROVED,
  GradeStatus.SUBMITTED,
]);

export class CanPublishGrade extends Specification<GradePublishContext> {
  isSatisfiedBy(candidate: GradePublishContext): boolean {
    return candidate.windowOpen && PUBLISHABLE.has(candidate.status);
  }
}
