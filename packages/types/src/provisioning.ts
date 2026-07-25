export type AuthenticationStatus = 'anonymous' | 'authenticated' | 'expired';

export interface ProvisioningUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
  readonly institutionId: string;
  readonly institutionName?: string;
}

export interface DeviceIdentity {
  readonly id: string;
  readonly fingerprint: string;
  readonly name: string;
  readonly platform: string;
  readonly osVersion: string;
  readonly appVersion: string;
}

export type ProvisioningStage =
  | 'welcome'
  | 'authentication'
  | 'registration'
  | 'downloading'
  | 'initializing'
  | 'verifying'
  | 'finalizing'
  | 'ready'
  | 'backend_gap';

export interface ProvisioningStatus {
  readonly authentication: AuthenticationStatus;
  readonly stage: ProvisioningStage;
  readonly user: ProvisioningUser | null;
  readonly device: DeviceIdentity;
  readonly isProvisioned: boolean;
  readonly completedAt: string | null;
  readonly message?: string;
  readonly missingCapabilities?: readonly string[];
  readonly progress?: number;
}

export interface AuthenticateRequest {
  readonly email: string;
  readonly password: string;
}

export interface ProvisioningProgress {
  readonly stage: ProvisioningStage;
  readonly percent: number;
  readonly message: string;
}

export interface RegisteredDevice {
  readonly id: string;
  readonly installationId: string;
  readonly fingerprint: string;
  readonly institutionId: string;
  readonly status: 'ACTIVE' | 'PENDING' | 'REVOKED';
  readonly registeredAt: string;
  readonly lastSeenAt: string;
}

export const PROVISIONING_COLLECTIONS = [
  'institutions', 'users', 'userOrganizations', 'academicYears', 'terms',
  'classes', 'subjects', 'classSubjects', 'students', 'guardians',
  'studentGuardians', 'enrollments', 'staff', 'subjectTeachers',
  'classTeachers', 'classSubjectTeachers',
  'timetableEntries',
] as const;

export type ProvisioningCollection = (typeof PROVISIONING_COLLECTIONS)[number];
export type ProvisioningRow = Readonly<Record<string, unknown>>;
export type ProvisioningData = Readonly<Record<ProvisioningCollection, readonly ProvisioningRow[]>>;

export interface ProvisioningSnapshot {
  readonly contractVersion: 1;
  readonly snapshotId: string;
  readonly generatedAt: string;
  readonly institutionId: string;
  readonly deviceId: string;
  readonly checksumAlgorithm: 'sha256';
  readonly checksum: string;
  readonly manifest: Readonly<Record<ProvisioningCollection, number>>;
  readonly data: ProvisioningData;
}
