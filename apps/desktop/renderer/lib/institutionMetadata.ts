type MetadataRecord = Record<string, unknown>;

export interface InstitutionContact {
  principal?: string;
  email?: string;
  phone?: string;
}

export interface InstitutionStatistics {
  studentCount?: number;
  maxCapacity?: number;
  teacherCount?: number;
  classrooms?: number;
  gradeRange?: string;
  staffCount?: number;
}

export interface NormalizedInstitutionMetadata extends MetadataRecord {
  contact: InstitutionContact;
  statistics: InstitutionStatistics;
}

function isRecord(value: unknown): value is MetadataRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function normalizeInstitutionMetadata(
  metadata: unknown,
): NormalizedInstitutionMetadata | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const existingContact = isRecord(metadata.contact) ? metadata.contact : {};
  const existingStatistics = isRecord(metadata.statistics)
    ? metadata.statistics
    : {};

  const normalized: NormalizedInstitutionMetadata = {
    ...metadata,
    contact: {
      ...existingContact,
      principal:
        asString(existingContact.principal) ?? asString(metadata.principalName),
      email: asString(existingContact.email) ?? asString(metadata.email),
      phone: asString(existingContact.phone) ?? asString(metadata.phone),
    },
    statistics: {
      ...existingStatistics,
      studentCount:
        asNumber(existingStatistics.studentCount) ??
        asNumber(metadata.studentCount),
      maxCapacity:
        asNumber(existingStatistics.maxCapacity) ??
        asNumber(metadata.maxCapacity),
      teacherCount:
        asNumber(existingStatistics.teacherCount) ??
        asNumber(metadata.teacherCount),
      classrooms:
        asNumber(existingStatistics.classrooms) ??
        asNumber(metadata.classrooms),
      gradeRange:
        asString(existingStatistics.gradeRange) ??
        asString(metadata.gradeRange),
      staffCount:
        asNumber(existingStatistics.staffCount) ??
        asNumber(metadata.staffCount),
    },
  };

  return normalized;
}

export function getInstitutionPrincipalName(
  metadata: unknown,
  fallback = "N/A",
) {
  return normalizeInstitutionMetadata(metadata)?.contact?.principal || fallback;
}

export function getInstitutionStatistics(metadata: unknown) {
  return normalizeInstitutionMetadata(metadata)?.statistics ?? {};
}
