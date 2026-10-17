import type {
  SchoolRegistration,
  SchoolRegistrationContext,
  SchoolRegistrationPayload,
  SchoolRegistrationSource,
} from '@nemis-desktop/types';

export interface NewSchoolRegistration {
  id: string;
  countyId: string;
  createdBy: string;
  source: SchoolRegistrationSource;
  payload: SchoolRegistrationPayload;
  now: string;
}

/** Schools a County Admin saved on this device and the server has not
 * accepted yet (school_registrations). Every read is scoped to one user and to
 * the synced county. */
export interface ISchoolRegistrationStore {
  /** The synced county (with its code, for school codes) and its active districts by name. */
  context(): SchoolRegistrationContext;
  /** Codes already used by a local institution or a non-rejected registration (any user), with that school's name. */
  existingCodes(codes: readonly string[]): Array<{ code: string; name: string }>;
  /** All rows or none. */
  insertMany(rows: readonly NewSchoolRegistration[]): void;
  getForUser(id: string, userId: string): SchoolRegistration | null;
  /** The user's rows in createdAt order; `ids` narrows to those ids. */
  listForUser(userId: string, ids?: readonly string[]): SchoolRegistration[];
  /** A rejected row back to pending with a new payload; false for any other row. */
  resubmit(id: string, userId: string, payload: SchoolRegistrationPayload, now: string): boolean;
  /** Deletes a rejected row; false for any other row. */
  discard(id: string, userId: string): boolean;
}
