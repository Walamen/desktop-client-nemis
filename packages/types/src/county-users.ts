/** County (CEO) Administrative Users page and its commands
 * (docs/superpowers/specs/2026-10-19-county-users-design.md). */
export type CountyUserRole = 'DEO' | 'INSTITUTION_ADMIN';
export type CountyAssignableRole = CountyUserRole | 'DATA_OFFICER';

export interface CountyUsersQuery {
  search?: string;
  role?: CountyUserRole;
  page: number;
  limit: number;
}

export interface CountyUserListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  photoUrl: string | null;
  role: CountyUserRole;
  isActive: boolean;
  /** NULL (unknown, e.g. an older server) counts as verified. */
  emailVerified: boolean | null;
  lastLoginAt: string | null;
  districtId: string | null;
  districtName: string | null;
  institutionId: string | null;
  schoolName: string | null;
}

export interface CountyUserStats {
  totalUsers: number;
  activeUsers: number;
  pendingActivation: number;
  schoolAdmins: number;
}

export interface CountyUsersResult {
  county: { id: string; name: string } | null;
  stats: CountyUserStats;
  data: CountyUserListItem[];
  total: number;
}

export interface CountyUserOptions {
  county: { id: string; name: string } | null;
  districts: Array<{ id: string; name: string }>;
  schools: Array<{ id: string; name: string; districtId: string | null }>;
}

export interface CountySetUserActiveRequest {
  userId: string;
  isActive: boolean;
}

/** Exactly one of districtId / institutionId. */
export interface CountyAssignUserRequest {
  userId: string;
  role: CountyAssignableRole;
  districtId?: string;
  institutionId?: string;
}

export interface CountyActivationLink {
  activationUrl: string;
}

export interface CountyCreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: CountyUserRole;
  institutionId?: string;
}

export interface CountyCreateUserResult {
  userId: string;
  activationUrl: string;
}

export interface CountyBulkUserRow {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: CountyUserRole;
  districtId?: string;
  institutionId?: string;
}

export interface CountyBulkCreateUsersResult {
  succeeded: Array<{ email: string; name: string; activationUrl: string | null }>;
  failed: Array<{ email: string; error: string }>;
}
