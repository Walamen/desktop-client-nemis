import type { Term } from '@nemis-desktop/domain';
import type { TermOutput } from '../../dto/academics/academics-dto';

export function toTermOutput(term: Term): TermOutput {
  return {
    id: term.id,
    academicYearId: term.academicYearId,
    name: term.name,
    startDate: term.period.start,
    endDate: term.period.end,
    isCurrent: term.isCurrent,
  };
}
