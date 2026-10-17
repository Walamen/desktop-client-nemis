import type { ISchoolRegistrationStore } from '../../interfaces/county/school-registration-store';
import { randomSchoolCode } from './school-registration-codes';

const MAX_DRAWS = 20;

/** A random code no local school, waiting registration or earlier school in
 * the same batch (`taken`) already uses. After MAX_DRAWS the last draw
 * stands; the server stays the judge. */
export function freeRandomCode(
  countyCode: string | null,
  random: () => number,
  store: ISchoolRegistrationStore,
  taken: ReadonlySet<string>,
): string {
  let code = randomSchoolCode(countyCode, random);
  for (let draw = 1; draw < MAX_DRAWS; draw++) {
    if (!taken.has(code) && store.existingCodes([code]).length === 0) return code;
    code = randomSchoolCode(countyCode, random);
  }
  return code;
}
