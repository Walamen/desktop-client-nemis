import type {
  DeoInfrastructureIssue,
  DeoInfrastructureStatus,
  DeoInfrastructureSummary,
} from '@nemis-desktop/types';
import type { DistrictInfrastructureRow } from '../../interfaces/deo/district-overview-read-model';

// Mirrors the server's SEVERITY_RANK (districts/district-alerts.ts).
const SEVERITY_RANK: Readonly<Record<string, number>> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const UNKNOWN_RANK = 4;

const LIVE_STATUSES: readonly string[] = ['OPEN', 'UNDER_REVIEW', 'ESCALATED'];

function metaRecord(metadata: unknown): Record<string, unknown> {
  return metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

/** The stored status when it is a live one; anything else reads as OPEN. */
export function infrastructureStatus(metadata: unknown): DeoInfrastructureStatus {
  const status = metaRecord(metadata).status;
  return typeof status === 'string' && LIVE_STATUSES.includes(status)
    ? (status as DeoInfrastructureStatus)
    : 'OPEN';
}

/** Mirrors the server's mapInfrastructureIssue. A district-only issue shows the district name. */
export function mapInfrastructureIssue(row: DistrictInfrastructureRow, districtName: string): DeoInfrastructureIssue {
  const meta = metaRecord(row.metadata);
  const category =
    typeof meta.category === 'string' && meta.category.trim() ? meta.category : 'Infrastructure';
  const submitted = typeof meta.submittedAt === 'string' ? new Date(meta.submittedAt) : null;
  const reportedAt = submitted && !Number.isNaN(submitted.getTime()) ? submitted : new Date(row.createdAt);
  return {
    id: row.id,
    schoolId: row.institutionId,
    schoolName: row.institutionId ? (row.schoolName ?? districtName) : districtName,
    category,
    title: row.title,
    note: row.description,
    severity: row.severity,
    status: infrastructureStatus(row.metadata),
    reportedAt: reportedAt.toISOString(),
  };
}

/** CRITICAL first, then newest reportedAt, then id. */
export function sortInfrastructureIssues(issues: DeoInfrastructureIssue[]): DeoInfrastructureIssue[] {
  return [...issues].sort((a, b) => {
    const rank = (SEVERITY_RANK[a.severity] ?? UNKNOWN_RANK) - (SEVERITY_RANK[b.severity] ?? UNKNOWN_RANK);
    if (rank !== 0) return rank;
    const time = Date.parse(b.reportedAt) - Date.parse(a.reportedAt);
    if (time !== 0) return time;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function infrastructureSummary(issues: DeoInfrastructureIssue[]): DeoInfrastructureSummary {
  return {
    totalIssues: issues.length,
    critical: issues.filter((i) => i.severity === 'CRITICAL').length,
    open: issues.filter((i) => i.status === 'OPEN' || i.status === 'UNDER_REVIEW').length,
    escalated: issues.filter((i) => i.status === 'ESCALATED').length,
  };
}
