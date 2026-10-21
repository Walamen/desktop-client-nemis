/**
 * County (CEO) Audit Trail and Settings pages, read from this device
 * (docs/superpowers/specs/2026-10-21-county-audit-settings-design.md).
 * The audit rows are the County Admin's own actions and those of the
 * county's DEOs and School Admins, last 12 months.
 */
export interface CountyAuditLog {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityLabel: string;
  actorName: string;
  /** "School" | "District" | "County" | "System". */
  scope: string;
  timestamp: string;
}

export interface CountyAuditOption {
  value: string;
  label: string;
}

export interface CountyAuditStats {
  /** Last 12 months. */
  total: number;
  /** Since local midnight. */
  today: number;
  /** Since local midnight 7 days ago. */
  week: number;
  /** Actions present, labelled, for the filter. */
  actions: CountyAuditOption[];
  /** Entity types present, labelled, for the filter. */
  entityTypes: CountyAuditOption[];
}

export interface CountyAuditQuery {
  search?: string;
  action?: string;
  entityType?: string;
  page: number;
  limit: number;
}

export interface CountyAuditPage {
  items: CountyAuditLog[];
  total: number;
  page: number;
  limit: number;
}

export interface CountySettings {
  county: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
  districtCount: number;
  schoolCount: number;
}
