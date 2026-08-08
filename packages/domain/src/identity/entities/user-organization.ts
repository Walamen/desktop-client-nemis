import { Entity } from '../../core';
import type { SystemRole } from '@nemis-desktop/types';

interface UserOrganizationProps {
  id: string;
  role: SystemRole;
  institutionId?: string;
  countyId?: string;
  districtId?: string;
  isActive: boolean;
}

export class UserOrganization extends Entity<string> {
  #props: UserOrganizationProps;

  private constructor(props: UserOrganizationProps) {
    super(props.id);
    this.#props = props;
  }

  static reconstitute(props: UserOrganizationProps): UserOrganization {
    return new UserOrganization(props);
  }

  get role(): SystemRole {
    return this.#props.role;
  }
  get institutionId(): string | undefined {
    return this.#props.institutionId;
  }
  get countyId(): string | undefined {
    return this.#props.countyId;
  }
  get districtId(): string | undefined {
    return this.#props.districtId;
  }
  get isActive(): boolean {
    return this.#props.isActive;
  }

  deactivate(): void {
    this.#props = { ...this.#props, isActive: false };
  }
}
