import type { SchoolModule } from './school-modules';

/** Mirrors the server SchoolOfficeUser (school-admin-users.service.ts). */
export interface SchoolOfficeUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  photoUrl: string | null;
  role: 'INSTITUTION_ADMIN' | 'INSTITUTION_STAFF';
  title: string | null;
  modules: SchoolModule[];
  isActive: boolean;
  lastLoginAt: string | null;
  staffId: string | null;
}

export interface LinkableStaff {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
}

export interface SchoolUsersResult {
  source: 'server' | 'device';
  users: SchoolOfficeUser[];
  linkableStaff: LinkableStaff[];
}

export interface CreateSchoolUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  title?: string;
  modules: SchoolModule[];
  staffId?: string;
}

export interface UpdateSchoolUserRequest {
  userId: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  title?: string | null;
  modules?: SchoolModule[];
}

export interface SetSchoolUserActiveRequest {
  userId: string;
  isActive: boolean;
}

export interface SchoolUserCredential {
  email: string;
  defaultPassword: string;
}

export interface CreateSchoolUserResult {
  user: SchoolOfficeUser;
  credential?: SchoolUserCredential;
}
