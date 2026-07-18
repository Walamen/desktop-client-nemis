import type { SystemRole } from '@nemis-desktop/types';

export interface UserOutput {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roles: SystemRole[];
}
