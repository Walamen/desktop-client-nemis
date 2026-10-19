import { describe, expect, it } from 'vitest';
import type { CountyBulkUserRow, CountyUserOptions } from '@nemis-desktop/types';
import { checkUserRows, MAX_BULK_USERS, parseUserCsv, USER_CSV_TEMPLATE } from './bulkUserCsv';

const HEADER = 'firstName,lastName,email,phoneNumber,role,districtId,institutionId';

const options: CountyUserOptions = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  districts: [{ id: 'd-1', name: 'Buchanan' }],
  schools: [{ id: 's-1', name: 'Buchanan High', districtId: 'd-1' }],
};

const row = (overrides: Partial<Record<keyof CountyBulkUserRow, string>> = {}): CountyBulkUserRow =>
  ({
    firstName: 'Musu',
    lastName: 'Kollie',
    email: 'musu@moe.gov.lr',
    phoneNumber: '+231770555111',
    role: 'DEO',
    ...overrides,
  }) as CountyBulkUserRow;

describe('parseUserCsv (the web parse)', () => {
  it('needs a header row and at least one data row', () => {
    expect(parseUserCsv(HEADER)).toEqual({
      rows: [],
      error: 'CSV file must contain a header row and at least one data row',
    });
    expect(parseUserCsv(`${HEADER}\n\n   \n`).error).toBe(
      'CSV file must contain a header row and at least one data row',
    );
  });

  it('lists the missing required columns', () => {
    expect(parseUserCsv('firstName,email,role\nA,a@b.lr,DEO').error).toBe(
      'Missing required columns: lastName, phoneNumber',
    );
  });

  it('reports the first row with a missing required field, counting the header', () => {
    const text = `${HEADER}\nMusu,Kollie,musu@moe.gov.lr,+231770555111,DEO,,\nJames,,j@moe.gov.lr,+231770555222,DEO,,`;
    expect(parseUserCsv(text)).toEqual({ rows: [], error: 'Row 3: Missing required fields' });
  });

  it('reads the rows, trims values and CRLF, and keeps the optional ids only when filled', () => {
    const text =
      `${HEADER}\r\n Musu , Kollie ,musu@moe.gov.lr,+231770555111,DEO,d-1,\r\n` +
      'Jane,Smith,jane@moe.gov.lr,+231770234567,INSTITUTION_ADMIN,,s-1\r\n';
    const { rows, error } = parseUserCsv(text);
    expect(error).toBeNull();
    expect(rows).toEqual([
      {
        firstName: 'Musu',
        lastName: 'Kollie',
        email: 'musu@moe.gov.lr',
        phoneNumber: '+231770555111',
        role: 'DEO',
        districtId: 'd-1',
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@moe.gov.lr',
        phoneNumber: '+231770234567',
        role: 'INSTITUTION_ADMIN',
        institutionId: 's-1',
      },
    ]);
    // No undefined keys: the IPC validator rejects unknown keys and the row crosses as-is.
    expect(Object.keys(rows[0]!)).not.toContain('institutionId');
    expect(Object.keys(rows[1]!)).not.toContain('districtId');
  });

  it('works without the optional columns, in any column order', () => {
    const { rows, error } = parseUserCsv('role,email,firstName,lastName,phoneNumber\nDEO,a@moe.gov.lr,A,B,+231770555111');
    expect(error).toBeNull();
    expect(rows).toEqual([
      { firstName: 'A', lastName: 'B', email: 'a@moe.gov.lr', phoneNumber: '+231770555111', role: 'DEO' },
    ]);
  });

  it('keeps the web template text', () => {
    expect(USER_CSV_TEMPLATE).toBe(
      `${HEADER}\nJohn,Doe,john@example.com,+231770123456,INSTITUTION_ADMIN,,inst_123\nJane,Smith,jane@example.com,+231770234567,DATA_OFFICER,,`,
    );
    expect(parseUserCsv(USER_CSV_TEMPLATE).rows).toHaveLength(2);
  });
});

describe('checkUserRows (desktop-only offline checks)', () => {
  it('passes clean rows', () => {
    expect(
      checkUserRows(
        [row(), row({ email: 'jane@moe.gov.lr', role: 'INSTITUTION_ADMIN', institutionId: 's-1', districtId: 'd-1' })],
        options,
      ),
    ).toEqual([]);
  });

  it('refuses a role other than DEO or INSTITUTION_ADMIN (SUPER_ADMIN, DATA_OFFICER)', () => {
    expect(checkUserRows([row({ role: 'SUPER_ADMIN' }), row({ email: 'b@moe.gov.lr', role: 'DATA_OFFICER' })], options)).toEqual([
      { row: 2, message: 'Row 2: role must be DEO or INSTITUTION_ADMIN' },
      { row: 3, message: 'Row 3: role must be DEO or INSTITUTION_ADMIN' },
    ]);
  });

  it('refuses a school or a district from another county', () => {
    expect(
      checkUserRows(
        [
          row({ role: 'INSTITUTION_ADMIN', institutionId: 'school-of-margibi' }),
          row({ email: 'b@moe.gov.lr', districtId: 'district-of-margibi' }),
        ],
        options,
      ),
    ).toEqual([
      { row: 2, message: 'Row 2: school is not in this county' },
      { row: 3, message: 'Row 3: district is not in this county' },
    ]);
  });

  it('refuses an invalid email', () => {
    expect(checkUserRows([row({ email: 'not-an-email' })], options)).toEqual([
      { row: 2, message: 'Row 2: invalid email' },
    ]);
  });

  it('refuses a repeated email, case-insensitively, naming the first row', () => {
    expect(
      checkUserRows([row(), row({ email: 'other@moe.gov.lr' }), row({ email: 'MUSU@Moe.gov.lr' })], options),
    ).toEqual([{ row: 4, message: 'Row 4: email repeats row 2' }]);
  });

  it('refuses what the IPC validator would refuse for the whole file: a bad phone, a long name, too many rows', () => {
    expect(checkUserRows([row({ phoneNumber: '0770123456' }), row({ email: 'b@moe.gov.lr', firstName: 'x'.repeat(101) })], options)).toEqual([
      { row: 2, message: 'Row 2: invalid phone number' },
      { row: 3, message: 'Row 3: name is too long' },
    ]);
    const many = Array.from({ length: MAX_BULK_USERS + 1 }, (_, i) => row({ email: `u${i}@moe.gov.lr` }));
    expect(checkUserRows(many, options)).toEqual([
      { row: 0, message: `At most ${MAX_BULK_USERS} users can be created at once` },
    ]);
  });
});
