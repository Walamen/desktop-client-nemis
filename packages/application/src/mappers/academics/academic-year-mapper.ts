import type { AcademicYear } from '@nemis-desktop/domain';
import type { AcademicYearOutput } from '../../dto/academics/academic-year-dto';

export function toAcademicYearOutput(year: AcademicYear): AcademicYearOutput {
  return {
    id: year.id,
    institutionId: year.institutionId,
    code: year.code.value,
    startDate: year.period.start,
    endDate: year.period.end,
    isCurrent: year.isCurrent,
  };
}
