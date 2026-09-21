// GOLDEN TEST VECTORS — byte-identical twin at:
//   Nemis/packages/utils/src/nemis-id.fixtures.ts
// If you change this file, change that one identically. The two repos'
// test suites both load these; divergence fails a build.

/** Valid 12-digit NEMIS IDs: 11 payload digits + correct Luhn check digit. */
export const VALID_NEMIS_IDS: readonly string[] = [
  '482915736045',
  '000000000000',
  '123456789015',
  '999999999991',
  '000000000018',
  '902100000006',
];

/** Rejected: wrong check digit, wrong length, or non-numeric. */
export const INVALID_NEMIS_IDS: readonly string[] = [
  '482915736042', // correct payload, wrong check digit (should be 5)
  '482915736040',
  '00000000001',  // 11 digits
  '0000000000000', // 13 digits
  '48291573604a', // non-numeric
  '',
  '4829-1573-6045', // separators are not valid canonical storage
];

/** normalize() accepts these separator variants of 482915736045. */
export const NORMALIZE_CASES: readonly string[] = [
  '482915736045',
  '4829-1573-6045',
  '4829 1573 6045',
  ' 4829-1573 6045 ',
];

export const FORMAT_CASES: readonly { raw: string; formatted: string }[] = [
  { raw: '482915736045', formatted: '4829-1573-6045' },
  { raw: '000000000000', formatted: '0000-0000-0000' },
];
