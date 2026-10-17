import type {
  SchoolRegistration,
  SchoolRegistrationContext,
  SchoolRegistrationPayload,
} from '@nemis-desktop/types';
import type {
  ISchoolRegistrationStore,
  NewSchoolRegistration,
} from '../../interfaces/county/school-registration-store';

type Row = SchoolRegistration & { createdBy: string };

/** Settable rows; `institutionCodes` stands in for synced institutions. */
export class InMemorySchoolRegistrationStore implements ISchoolRegistrationStore {
  county: SchoolRegistrationContext['county'] = null;
  districts: SchoolRegistrationContext['districts'] = [];
  rows: Row[] = [];
  institutionCodes = new Map<string, string>();

  context(): SchoolRegistrationContext {
    return { county: this.county, districts: this.districts };
  }

  existingCodes(codes: readonly string[]): Array<{ code: string; name: string }> {
    return codes.flatMap((code) => {
      const institution = this.institutionCodes.get(code);
      if (institution !== undefined) return [{ code, name: institution }];
      const row = this.rows.find((r) => r.payload.code === code && r.syncState !== 'rejected');
      return row ? [{ code, name: row.payload.name }] : [];
    });
  }

  insertMany(rows: readonly NewSchoolRegistration[]): void {
    for (const row of rows) {
      this.rows.push({
        id: row.id,
        countyId: row.countyId,
        createdBy: row.createdBy,
        source: row.source,
        payload: row.payload,
        syncState: 'pending',
        syncError: null,
        principalLogin: null,
        createdAt: row.now,
        updatedAt: row.now,
        syncedAt: null,
      });
    }
  }

  getForUser(id: string, userId: string): SchoolRegistration | null {
    return this.rows.find((r) => r.id === id && r.createdBy === userId) ?? null;
  }

  listForUser(userId: string, ids?: readonly string[]): SchoolRegistration[] {
    return this.rows.filter((r) => r.createdBy === userId && (!ids || ids.includes(r.id)));
  }

  resubmit(id: string, userId: string, payload: SchoolRegistrationPayload, now: string): boolean {
    const row = this.rows.find((r) => r.id === id && r.createdBy === userId && r.syncState === 'rejected');
    if (!row) return false;
    Object.assign(row, { payload, syncState: 'pending', syncError: null, updatedAt: now });
    return true;
  }

  discard(id: string, userId: string): boolean {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.id === id && r.createdBy === userId && r.syncState === 'rejected'));
    return this.rows.length < before;
  }
}
