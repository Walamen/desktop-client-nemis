import type {
  AcademicYearListItemResult,
  AcademicYearResult,
  CreateAcademicYearRequest,
  SetAcademicYearStatusRequest,
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
  setCurrentAcademicYear: (id: string): Promise<AcademicYearListItemResult> =>
    api().academicYear.setCurrent(id),
  setAcademicYearStatus: (
    request: SetAcademicYearStatusRequest,
  ): Promise<AcademicYearListItemResult> => api().academicYear.setStatus(request),
};
