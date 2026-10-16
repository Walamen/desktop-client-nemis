import type { CountySchoolDetails } from '@nemis-desktop/types';

/** portal-web Institution (findAll) as the ported Schools list reads it. */
export interface SchoolCardView {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  photoUrl: string | null;
  district: { name: string } | null;
  levels: { level: string }[];
  _count: { students: number };
}

export interface CountySchoolsView {
  county: { id: string; name: string } | null;
  districtCount: number;
  schools: SchoolCardView[];
}

/** portal-web Institution (findOne) as the ported School detail page reads it. */
export interface SchoolDetailView extends CountySchoolDetails {
  id: string;
  name: string;
  code: string;
  type: string;
  ownership: string;
  approvalStatus: string;
  isActive: boolean;
  address: string | null;
  contactPhone: string | null;
  contactPersonPhone: string | null;
  emisCode: string | null;
  metadata: Record<string, unknown> | undefined;
  levels: { level: string }[];
  district: { name: string } | null;
  county: { name: string } | null;
  _count: { students: number; staff: number };
  users: {
    role: 'INSTITUTION_ADMIN';
    user: { firstName: string; lastName: string; email: string | null; photoUrl: string | null };
  }[];
}
