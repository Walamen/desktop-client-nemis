import type {
  CountySchoolDetail,
  CountySchoolDetails,
  CountySchoolListItem,
  SchoolRegistration,
} from '@nemis-desktop/types';

/** A waiting or refused school as a Schools list card. */
export function registrationToListItem(r: SchoolRegistration, districtName: string | null): CountySchoolListItem {
  return {
    id: r.id,
    name: r.payload.name,
    code: r.payload.code,
    type: r.payload.type,
    isActive: true,
    districtName,
    levels: r.payload.levels,
    studentCount: 0,
    photoUrl: null,
    syncState: r.syncState,
    syncError: r.syncError,
  };
}

const DETAIL_KEYS = [
  'establishedYear', 'accessMode', 'isBoarding', 'isUrban', 'numBuildings', 'numClassrooms',
  'numBathrooms', 'waecCode', 'principalName', 'hasLibrary', 'hasComputerLab', 'hasSportsField',
  'hasKitchen', 'hasCafeteria', 'hasElectricity', 'hasSafeWater', 'hasWaterAccess', 'hasTextbooks',
  'hasWash', 'hasPTA', 'hasAuditorium', 'hasClinic',
] as const satisfies ReadonlyArray<keyof CountySchoolDetails>;

/** A school only this device knows yet, shaped like the server's detail. It
 * would be created active and approved, as the web's county-created schools are. */
export function registrationToDetail(
  r: SchoolRegistration,
  districtName: string | null,
  countyName: string | null,
): CountySchoolDetail {
  const p = r.payload;
  const details: Record<string, unknown> = {};
  for (const key of DETAIL_KEYS) {
    if (p[key] !== undefined) details[key] = p[key];
  }
  const admin = p.admins[0];
  return {
    id: r.id,
    name: p.name,
    code: p.code,
    type: p.type,
    ownership: p.ownership,
    approvalStatus: 'APPROVED',
    isActive: true,
    street: p.address ?? null,
    communityTown: p.communityTown ?? null,
    contactPhone: p.contactPhone ?? null,
    contactPersonPhone: p.contactPersonPhone ?? null,
    emisCode: p.emisCode ?? null,
    officialSchoolCode: null,
    metadata: p.metadata ?? null,
    levels: p.levels,
    details: details as CountySchoolDetails,
    districtName,
    countyName,
    studentCount: 0,
    staffCount: 0,
    principal: admin
      ? { firstName: admin.firstName, lastName: admin.lastName, email: admin.email, photoUrl: null }
      : null,
    registration: registrationInfo(r),
  };
}

export function registrationInfo(r: SchoolRegistration): CountySchoolDetail['registration'] {
  return { syncState: r.syncState, syncError: r.syncError, source: r.source, principalLogin: r.principalLogin };
}
