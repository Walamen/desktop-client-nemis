/** Advisory permission hook. Authorization remains backend-authoritative; this
 * lets the desktop shell enforce coarse local checks as a convenience. */
export interface PermissionRequest {
  readonly action: string;
  readonly resource?: string;
  readonly actorId?: string;
}

export interface PermissionDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface IPermissionEvaluator {
  evaluate(request: PermissionRequest): PermissionDecision;
}
