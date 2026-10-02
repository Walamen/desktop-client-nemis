/**
 * SQL restricting a students query to the workspace's own school. The local
 * students table can hold children who have LEFT this school (re-pointed by
 * applyDepartures, kept for their history), so a read that means "our
 * students" must say so. Reads provisioning_metadata in the same database,
 * so no repository needs to be told the institution.
 *
 * District/county/ministry workspaces record no institution and legitimately
 * hold several schools — the expression is then true for every row. The same
 * holds before provisioning has written its metadata row (the subquery is
 * NULL), which is what existing repository tests rely on.
 *
 * National-uniqueness checks (nemisId) and findById must NOT use this.
 */
export function workspaceStudentScope(alias: string): string {
  const workspaceInstitution = `(SELECT institutionId FROM provisioning_metadata WHERE id = 'singleton')`;
  return `(${workspaceInstitution} IS NULL OR ${alias}.institutionId = ${workspaceInstitution})`;
}
