import type { DeoComplianceItem, DeoComplianceStatus, DeoComplianceSummary } from '@nemis-desktop/types';

/**
 * The three compliance rows a District Education Officer sees per school.
 *
 * One rule, two copies: this one serves the offline desktop, and the Nemis
 * server (apps/Server/src/common/district/compliance-rows.ts) computes the
 * same for the web. Pure on purpose. Change both copies together.
 */

export interface ComplianceSchoolInput {
  id: string;
  name: string;
  code: string;
  principalName: string | null;
  /** Last 3 calendar months, from the Schools-page report dots. */
  reportMonths: boolean[];
  lastSubmissionAt: string | null;
  approvalStatus: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  /** Active TEACHER / ASSISTANT_TEACHER staff of the school. */
  teachers: {
    total: number;
    awaitingApproval: number;
    newestCreatedAt: string | null;
  };
}

export function formatCompliancePeriod(dateIso: string | null): string {
  if (!dateIso) return 'Awaiting submission';
  return new Date(dateIso).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function registrationStatus(approvalStatus: string | null): DeoComplianceStatus {
  switch (approvalStatus) {
    case 'APPROVED':
      return 'APPROVED';
    case 'PENDING':
    case 'UNDER_REVIEW':
      return 'PENDING';
    case 'REJECTED':
      return 'REJECTED';
    default:
      return 'MISSING';
  }
}

export function complianceRows(school: ComplianceSchoolInput): DeoComplianceItem[] {
  const base = {
    schoolId: school.id,
    schoolName: school.name,
    schoolCode: school.code,
  };

  const registrationDate = school.approvedAt ?? school.createdAt;
  const registration: DeoComplianceItem = {
    ...base,
    id: `${school.id}:registration`,
    reportType: 'Registration',
    period: formatCompliancePeriod(registrationDate),
    submittedBy: school.principalName ?? 'Not recorded',
    note: 'School onboarding and approval record',
    date: registrationDate,
    status: registrationStatus(school.approvalStatus),
  };

  const { total, awaitingApproval } = school.teachers;
  const rosterDate = total > 0 ? school.teachers.newestCreatedAt : null;
  const roster: DeoComplianceItem = {
    ...base,
    id: `${school.id}:teachers`,
    reportType: 'Teacher Roster',
    period: formatCompliancePeriod(rosterDate),
    submittedBy:
      total === 0 ? 'No teacher records' : total === 1 ? '1 teacher' : `${total} teachers`,
    note:
      total === 0
        ? 'No teacher records have been submitted'
        : awaitingApproval > 0
          ? `${awaitingApproval} of ${total} awaiting approval`
          : 'No teachers awaiting approval',
    date: rosterDate,
    status: total === 0 ? 'MISSING' : awaitingApproval > 0 ? 'PENDING' : 'APPROVED',
  };

  const submittedMonths = school.reportMonths.filter(Boolean).length;
  const monthly: DeoComplianceItem = {
    ...base,
    id: `${school.id}:monthly-reports`,
    reportType: 'Monthly Reports',
    period: formatCompliancePeriod(school.lastSubmissionAt),
    submittedBy: 'School reports',
    note: `${submittedMonths}/3 months with a submitted report`,
    date: school.lastSubmissionAt,
    status: submittedMonths >= 3 ? 'APPROVED' : submittedMonths > 0 ? 'PENDING' : 'MISSING',
  };

  return [registration, roster, monthly];
}

export function complianceSummary(items: DeoComplianceItem[]): DeoComplianceSummary {
  const count = (status: DeoComplianceStatus) => items.filter((item) => item.status === status).length;
  return {
    total: items.length,
    approved: count('APPROVED'),
    pending: count('PENDING'),
    rejected: count('REJECTED'),
    missing: count('MISSING'),
  };
}
