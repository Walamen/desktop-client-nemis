import type { CountySchoolDetail, CountySchoolsResult } from '@nemis-desktop/types';
import type { CountySchoolsView, SchoolDetailView } from '../../view-models/county/county-schools-views';

export function toCountySchoolsView(dto: CountySchoolsResult): CountySchoolsView {
  return {
    county: dto.county,
    districtCount: dto.districtCount,
    schools: dto.schools.map((school) => ({
      id: school.id,
      name: school.name,
      code: school.code,
      isActive: school.isActive,
      photoUrl: school.photoUrl,
      district: school.districtName ? { name: school.districtName } : null,
      levels: school.levels.map((level) => ({ level })),
      _count: { students: school.studentCount },
      syncState: school.syncState,
      syncError: school.syncError,
    })),
  };
}

export function toSchoolDetailView(dto: CountySchoolDetail): SchoolDetailView {
  return {
    ...(dto.details ?? {}),
    id: dto.id,
    name: dto.name,
    code: dto.code,
    type: dto.type,
    ownership: dto.ownership,
    approvalStatus: dto.approvalStatus,
    isActive: dto.isActive,
    address: dto.street,
    contactPhone: dto.contactPhone,
    contactPersonPhone: dto.contactPersonPhone,
    emisCode: dto.emisCode,
    metadata: dto.metadata ?? undefined,
    levels: dto.levels.map((level) => ({ level })),
    district: dto.districtName ? { name: dto.districtName } : null,
    county: dto.countyName ? { name: dto.countyName } : null,
    _count: { students: dto.studentCount, staff: dto.staffCount },
    users: dto.principal ? [{ role: 'INSTITUTION_ADMIN', user: dto.principal }] : [],
    registration: dto.registration,
  };
}
