import type { AcademicYearOutput } from '@nemis-desktop/application';
import type { AcademicYearView } from '../../view-models/academic-year/academic-year-views';

export function toAcademicYearView(dto: AcademicYearOutput): AcademicYearView {
  return { id: dto.id, code: dto.code, startDate: dto.startDate, endDate: dto.endDate };
}
