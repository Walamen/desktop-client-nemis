import type {
  AcademicYearListItemResult,
  AcademicYearResult,
  CreateAcademicYearRequest,
  UpdateAcademicYearRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

export const academicYearBridge = {
  getCurrentAcademicYear: (): Promise<AcademicYearResult | null> => api().academicYear.getCurrent(),
  listAcademicYears: (): Promise<AcademicYearListItemResult[]> => api().academicYear.list(),
  createAcademicYear: (request: CreateAcademicYearRequest): Promise<AcademicYearListItemResult> =>
    api().academicYear.create(request),
  updateAcademicYear: (request: UpdateAcademicYearRequest): Promise<AcademicYearListItemResult> =>
    api().academicYear.update(request),
};
