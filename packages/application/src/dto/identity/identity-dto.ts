import type { SystemRole } from '@nemis-desktop/types';

export interface UserOutput {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  email: string | null;
  isActive: boolean;
  roles: SystemRole[];
}
