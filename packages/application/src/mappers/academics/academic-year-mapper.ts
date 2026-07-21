import type { AcademicYear } from '@nemis-desktop/domain';
import type {
  AcademicYearListItemOutput,
  AcademicYearOutput,
} from '../../dto/academics/academic-year-dto';

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

export function toAcademicYearListItemOutput(
  year: AcademicYear,
  counts: { termCount: number; classCount: number },
): AcademicYearListItemOutput {
  return {
    ...toAcademicYearOutput(year),
    status: year.status,
    termCount: counts.termCount,
    classCount: counts.classCount,
  };
}
