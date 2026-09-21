// NEMIS student identifier: 12 digits = 11 CSPRNG-random + 1 Luhn check digit.
//
// BYTE-IDENTICAL TWIN at:
//   Nemis/packages/utils/src/nemis-id.ts
// Change one, change the other. Both repos load the same golden fixtures,
// so divergence fails a build.
//
// The ID deliberately encodes nothing — not county, school, year, or date of
// birth — and is not sequential. A student who transfers must keep an ID that
// still matches their record, and the Phase C lookup returns a student's
// details from this ID, so it must be hard to guess.

const PAYLOAD_DIGITS = 11;
const TOTAL_DIGITS = 12;

/** Luhn check digit for an 11-digit payload. Doubling starts at the rightmost payload digit. */
export function luhnCheckDigit(payload: string): number {
  let sum = 0;
  let double = true;
  for (let i = payload.length - 1; i >= 0; i--) {
    let digit = payload.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

// Rejection sampling: 256 % 10 !== 0, so bytes 250-255 would bias the result.
function randomDigit(): number {
  const buffer = new Uint8Array(1);
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0]! >= 250);
  return buffer[0]! % 10;
}

export function generateNemisId(): string {
  let payload = "";
  for (let i = 0; i < PAYLOAD_DIGITS; i++) payload += randomDigit();
  return payload + String(luhnCheckDigit(payload));
}

export function isValidNemisId(value: string): boolean {
  if (typeof value !== "string" || !/^\d{12}$/.test(value)) return false;
  return luhnCheckDigit(value.slice(0, PAYLOAD_DIGITS)) ===
    value.charCodeAt(TOTAL_DIGITS - 1) - 48;
}

/** Strips separators and validates. Returns canonical 12 digits, or null. */
export function normalizeNemisId(value: string): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return isValidNemisId(digits) ? digits : null;
}

/** Presentation only: 482915736045 -> 4829-1573-6045. Never stored or compared. */
export function formatNemisId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== TOTAL_DIGITS) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}
