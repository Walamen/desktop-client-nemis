import type { CountyBulkUserRow, CountyUserOptions, CountyUserRole } from '@nemis-desktop/types';

/** portal-web county users bulk page's template, verbatim. */
export const USER_CSV_TEMPLATE = `firstName,lastName,email,phoneNumber,role,districtId,institutionId
John,Doe,john@example.com,+231770123456,INSTITUTION_ADMIN,,inst_123
Jane,Smith,jane@example.com,+231770234567,DATA_OFFICER,,`;

/** The IPC validator's cap on one bulk call (MAX_COUNTY_BULK_USERS). */
export const MAX_BULK_USERS = 500;

const REQUIRED_HEADERS = ['firstName', 'lastName', 'email', 'phoneNumber', 'role'] as const;
const BULK_ROLES: readonly CountyUserRole[] = ['DEO', 'INSTITUTION_ADMIN'];

// Same rules as the Create User wizard (createUserSchema) and the IPC validator.
const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;
const PHONE_PATTERN = /^\+?[1-9]\d{1,14}$/;
const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 255;

/** The web's parse: a plain comma split, no quoted fields (spec §5.4), with
 * its messages verbatim. Rows keep the role as typed — checkUserRows refuses
 * anything but DEO / INSTITUTION_ADMIN. The optional ids are set only when
 * filled, so no undefined key crosses IPC. */
export function parseUserCsv(text: string): { rows: CountyBulkUserRow[]; error: string | null } {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    return { rows: [], error: 'CSV file must contain a header row and at least one data row' };
  }

  const headers = lines[0]?.split(',').map((h) => h.trim()) ?? [];
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return { rows: [], error: `Missing required columns: ${missingHeaders.join(', ')}` };
  }

  const rows: CountyBulkUserRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]?.split(',').map((v) => v.trim()) ?? [];
    const column = (name: string): string => {
      const index = headers.indexOf(name);
      return index < 0 ? '' : (values[index] ?? '');
    };
    const firstName = column('firstName');
    const lastName = column('lastName');
    const email = column('email');
    const phoneNumber = column('phoneNumber');
    const role = column('role');
    if (!firstName || !lastName || !email || !phoneNumber || !role) {
      return { rows: [], error: `Row ${i + 1}: Missing required fields` };
    }
    const districtId = column('districtId');
    const institutionId = column('institutionId');
    rows.push({
      firstName,
      lastName,
      email,
      phoneNumber,
      role: role as CountyUserRole,
      ...(districtId ? { districtId } : {}),
      ...(institutionId ? { institutionId } : {}),
    });
  }
  return { rows, error: null };
}

/** Desktop-only checks (spec §5.4), against this county's local districts and
 * schools, so a bad file is fixed before anything is sent. Row numbers count
 * the header, as the web's parse does. Also catches what the IPC validator
 * would refuse for the whole file (phone, name length, row count). */
export function checkUserRows(
  rows: CountyBulkUserRow[],
  options: CountyUserOptions,
): Array<{ row: number; message: string }> {
  if (rows.length > MAX_BULK_USERS) {
    return [{ row: 0, message: `At most ${MAX_BULK_USERS} users can be created at once` }];
  }
  const schoolIds = new Set(options.schools.map((s) => s.id));
  const districtIds = new Set(options.districts.map((d) => d.id));
  const firstRowByEmail = new Map<string, number>();
  const problems: Array<{ row: number; message: string }> = [];

  rows.forEach((user, index) => {
    const row = index + 2;
    const add = (message: string) => problems.push({ row, message: `Row ${row}: ${message}` });

    if (!(BULK_ROLES as readonly string[]).includes(user.role)) add('role must be DEO or INSTITUTION_ADMIN');
    // As the Create wizard: a School Admin needs a school (the web would make a county-scoped link).
    if (user.role === 'INSTITUTION_ADMIN' && !user.institutionId) add('School Admin needs an institutionId');
    if (user.institutionId && !schoolIds.has(user.institutionId)) add('school is not in this county');
    if (user.districtId && !districtIds.has(user.districtId)) add('district is not in this county');

    const email = user.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > EMAIL_MAX_LENGTH) {
      add('invalid email');
    } else {
      const first = firstRowByEmail.get(email);
      if (first !== undefined) add(`email repeats row ${first}`);
      else firstRowByEmail.set(email, row);
    }

    if (!PHONE_PATTERN.test(user.phoneNumber)) add('invalid phone number');
    if (user.firstName.length > NAME_MAX_LENGTH || user.lastName.length > NAME_MAX_LENGTH) add('name is too long');
  });
  return problems;
}
