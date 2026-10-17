import isEmail from 'validator/lib/isEmail';

/** Desktop-only checks (Alvin, 2026-10-17): offline, a server refusal only
 * shows up days later, so the form catches what the server's
 * CreateInstitutionDto / AdminUserDto would refuse anyway. Each returns the
 * message to show, or null. */

/** AdminUserDto.email: @IsEmail() — the same validator.js rule class-validator uses. */
export function emailError(email: string): string | null {
  const value = email.trim();
  if (!value) return 'Required';
  return isEmail(value) ? null : 'Invalid email';
}

/** AdminUserDto.firstName/lastName: @MinLength(2), on the parts portal-web
 * splits the principal's name into (last falls back to first). */
export function principalNameError(name: string): string | null {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.slice(1).join(' ') || first;
  return first.length < 2 || last.length < 2 ? 'First and last name must each be at least 2 characters' : null;
}

/** CreateInstitutionDto.establishedYear: @Min(1800). */
export function establishedYearError(value: string): string | null {
  return value.trim() && (parseInt(value, 10) || 0) < 1800 ? 'Must be 1800 or later' : null;
}

/** CreateInstitutionDto num* fields: @Min(0). */
export function countError(value: string): string | null {
  return value.trim() && parseInt(value, 10) < 0 ? 'Cannot be negative' : null;
}
