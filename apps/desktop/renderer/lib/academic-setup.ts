/** Academic years, terms and assessment periods are managed in drawers on the
 * school-admin Academic Grading page. Links elsewhere in the app open the
 * right drawer through `?open=` (and `?yearId=` for Terms). The app is a
 * static export, so this is the only way old links can land in the right
 * place — there are no server redirects. */
export const ACADEMIC_GRADING_PATH = '/government/school-admin/academic-grading';

export type SetupDrawerTarget = 'years' | 'terms' | 'periods';

const TARGETS: readonly string[] = ['years', 'terms', 'periods'];

export function academicSetupHref(drawer: SetupDrawerTarget, opts: { yearId?: string } = {}): string {
  const params = new URLSearchParams({ open: drawer });
  if (opts.yearId) params.set('yearId', opts.yearId);
  return `${ACADEMIC_GRADING_PATH}?${params.toString()}`;
}

export function parseSetupDrawerTarget(value: string): SetupDrawerTarget | null {
  return TARGETS.includes(value) ? (value as SetupDrawerTarget) : null;
}
