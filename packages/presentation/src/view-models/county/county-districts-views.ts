/** portal-web District (districts.service findAll with includeDeo) as the
 * ported list page reads it. */
export interface DistrictCardView {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  _count: { institutions: number; users: number };
  users: {
    user: { id: string; firstName: string; lastName: string; email: string | null; imageUrl: string | null };
  }[];
}

/** portal-web ManagementUser fields the Manage DEO drawer reads. */
export interface DeoUserView {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  imageUrl: string | null;
  districtId: string | null;
}

export interface DistrictOfficerView {
  userId: string;
  name: string;
  email: string | null;
}

export interface CountyDistrictsView {
  county: { id: string; name: string } | null;
  districts: DistrictCardView[];
  deoUsers: DeoUserView[];
  officersByDistrict: Record<string, DistrictOfficerView[]>;
}

/** portal-web Institution fields the detail table reads. `level` and
 * `principalName` are not Institution fields on the web either, so they are
 * always undefined — the ported table shows "N/A" / the metadata principal. */
export interface DistrictSchoolView {
  id: string;
  name: string;
  code: string;
  emisCode: string | null;
  officialSchoolCode: string | null;
  address: string | null;
  communityTown: string | null;
  ownership: string;
  contactPhone: string | null;
  contactPersonPhone: string | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  level?: string;
  principalName?: string;
}

export interface CountyDistrictDetailView {
  county: { id: string; name: string } | null;
  district: { id: string; name: string; code: string | null; isActive: boolean; institutions: DistrictSchoolView[] };
  officers: DistrictOfficerView[];
  /** The web's GET /institutions?districtId&type=SCHOOL list. */
  schools: DistrictSchoolView[];
  stats: {
    totalSchools: number;
    totalStudents: number;
    totalTeachers: number;
    deoCount: number;
    studentTeacherRatio: number;
  };
}
