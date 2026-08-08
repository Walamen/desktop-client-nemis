import { AggregateRoot } from '../../core';
import type { EntityId } from '../../core';
import { Address, GpsLocation } from '../../value-objects';
import { InvalidStateException } from '../../exceptions';
import { ApprovalStatus } from '@nemis-desktop/types';
import type { InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { SchoolCode } from '../value-objects/school-code';

export type InstitutionId = EntityId<'Institution'>;

/** Wide profile fields (infrastructure booleans etc.) are carried opaquely to stay
 * faithful to the schema without inventing invariants for each. See domain README. */
export type InstitutionProfile = Record<string, unknown>;

interface InstitutionState {
  code: SchoolCode;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  countyId: string;
  districtId?: string;
  approvalStatus: ApprovalStatus;
  address: Address;
  location?: GpsLocation;
  rejectionReason?: string;
  profile: InstitutionProfile;
}

export interface CreateInstitutionInput {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  countyId: string;
  districtId?: string;
  address?: { street?: string; communityTown?: string };
  location?: { latitude: number; longitude: number };
  occurredAt: string;
}

export interface ReconstituteInstitutionInput {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  countyId: string;
  districtId?: string;
  approvalStatus: ApprovalStatus;
  address?: { street?: string; communityTown?: string };
  location?: { latitude: number; longitude: number };
  rejectionReason?: string;
  profile?: Record<string, unknown>;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class Institution extends AggregateRoot<InstitutionId> {
  #state: InstitutionState;

  private constructor(
    id: InstitutionId,
    state: InstitutionState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateInstitutionInput): Institution {
    return new Institution(
      input.id as InstitutionId,
      {
        code: SchoolCode.create(input.code),
        name: input.name,
        type: input.type,
        ownership: input.ownership,
        countyId: input.countyId,
        districtId: input.districtId,
        approvalStatus: ApprovalStatus.PENDING,
        address: Address.create(input.address ?? {}),
        location: input.location ? GpsLocation.create(input.location) : undefined,
        profile: {},
      },
      { version: 1, updatedAt: input.occurredAt },
    );
  }

  static reconstitute(input: ReconstituteInstitutionInput): Institution {
    return new Institution(
      input.id as InstitutionId,
      {
        code: SchoolCode.create(input.code),
        name: input.name,
        type: input.type,
        ownership: input.ownership,
        countyId: input.countyId,
        districtId: input.districtId,
        approvalStatus: input.approvalStatus,
        address: Address.create(input.address ?? {}),
        location: input.location ? GpsLocation.create(input.location) : undefined,
        rejectionReason: input.rejectionReason,
        profile: input.profile ?? {},
      },
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get code(): SchoolCode {
    return this.#state.code;
  }
  get name(): string {
    return this.#state.name;
  }
  get type(): InstitutionType {
    return this.#state.type;
  }
  get ownership(): OwnershipType {
    return this.#state.ownership;
  }
  get districtId(): string | undefined {
    return this.#state.districtId;
  }
  get approvalStatus(): ApprovalStatus {
    return this.#state.approvalStatus;
  }
  get address(): Address {
    return this.#state.address;
  }
  get location(): GpsLocation | undefined {
    return this.#state.location;
  }
  get isApproved(): boolean {
    return this.#state.approvalStatus === ApprovalStatus.APPROVED;
  }
  get profile(): Readonly<Record<string, unknown>> {
    return this.#state.profile;
  }

  approve(by: string, at: string): void {
    if (this.#state.approvalStatus === ApprovalStatus.APPROVED) {
      throw new InvalidStateException('Institution is already approved');
    }
    this.#state = {
      ...this.#state,
      approvalStatus: ApprovalStatus.APPROVED,
      rejectionReason: undefined,
    };
    this.touch(by, at);
  }

  reject(reason: string, by: string, at: string): void {
    if (this.#state.approvalStatus === ApprovalStatus.REJECTED) {
      throw new InvalidStateException('Institution is already rejected');
    }
    this.#state = {
      ...this.#state,
      approvalStatus: ApprovalStatus.REJECTED,
      rejectionReason: reason,
    };
    this.touch(by, at);
  }
}
