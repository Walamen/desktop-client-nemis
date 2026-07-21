import type { AcademicYearStatus } from '@nemis-desktop/types';

export interface AcademicYearOutput {
  id: string;
  institutionId: string;
  code: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface AcademicYearListItemOutput extends AcademicYearOutput {
  status: AcademicYearStatus;
  termCount: number;
  classCount: number;
}

export interface CreateAcademicYearDto {
  code: string;
  startDate: string;
  endDate: string;
  makeCurrent?: boolean;
  actorId?: string;
}

export interface UpdateAcademicYearDto {
  id: string;
  code?: string;
  startDate?: string;
  endDate?: string;
  actorId?: string;
}

export interface SetAcademicYearStatusDto {
  id: string;
  status: AcademicYearStatus;
  actorId?: string;
}
