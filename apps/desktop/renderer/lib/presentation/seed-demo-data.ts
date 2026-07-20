import type { TestPorts } from '@nemis-desktop/presentation/testing';
import type { ApplicationLayer } from '@nemis-desktop/application';
import { User, UserOrganization, Institution } from '@nemis-desktop/domain';
import {
  ApprovalStatus,
  Gender,
  InstitutionType,
  OwnershipType,
  SystemRole,
} from '@nemis-desktop/types';

export const DEMO_INSTITUTION_ID = 'inst-1';
export const DEMO_USER_ID = 'usr-1';

const DEMO_STUDENTS: readonly { first: string; last: string; gender: Gender }[] = [
  { first: 'Grace', last: 'Toe', gender: Gender.FEMALE },
  { first: 'Emmanuel', last: 'Kollie', gender: Gender.MALE },
  { first: 'Fatu', last: 'Sirleaf', gender: Gender.FEMALE },
  { first: 'Prince', last: 'Weah', gender: Gender.MALE },
  { first: 'Musu', last: 'Johnson', gender: Gender.FEMALE },
];

/** Seed a demo school. Students go through the REAL create use case so the
 * data flows the same path production data will. The institution and user are
 * reconstituted directly into the fakes (no create use case exists for them). */
export async function seedDemoData(app: ApplicationLayer, ports: TestPorts): Promise<void> {
  ports.institutions.store.set(
    DEMO_INSTITUTION_ID,
    Institution.reconstitute({
      id: DEMO_INSTITUTION_ID,
      code: 'lib-001',
      name: 'Monrovia Central School',
      type: InstitutionType.SCHOOL,
      ownership: OwnershipType.GOVERNMENT,
      countyId: 'county-1',
      approvalStatus: ApprovalStatus.APPROVED,
      address: { communityTown: 'Sinkor, Monrovia' },
      version: 1,
      updatedAt: '2026-07-19T00:00:00.000Z',
    }),
  );

  ports.users.store.set(
    DEMO_USER_ID,
    User.reconstitute({
      id: DEMO_USER_ID,
      firstName: 'Joseph',
      lastName: 'Boakai',
      email: 'principal@monrovia-central.edu.lr',
      isActive: true,
      organizations: [
        UserOrganization.reconstitute({
          id: 'org-1',
          role: SystemRole.INSTITUTION_ADMIN,
          institutionId: DEMO_INSTITUTION_ID,
          isActive: true,
        }),
      ],
      version: 1,
      updatedAt: '2026-07-19T00:00:00.000Z',
    }),
  );

  for (const [i, s] of DEMO_STUDENTS.entries()) {
    await app.students.create({
      institutionId: DEMO_INSTITUTION_ID,
      firstName: s.first,
      lastName: s.last,
      admissionNumber: `MCS-2026-${String(i + 1).padStart(3, '0')}`,
      dateOfBirth: '2014-05-01',
      gender: s.gender,
    });
  }
}
