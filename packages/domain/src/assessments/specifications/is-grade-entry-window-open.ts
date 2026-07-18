import { Specification } from '../../core';
import { WindowStatus } from '@nemis-desktop/types';

export class IsGradeEntryWindowOpen extends Specification<{ status: WindowStatus }> {
  isSatisfiedBy(candidate: { status: WindowStatus }): boolean {
    return candidate.status === WindowStatus.OPEN;
  }
}
