import type {
  IPermissionEvaluator,
  PermissionDecision,
  PermissionRequest,
} from '../interfaces/permission-evaluator';

export class AllowAllPermissionEvaluator implements IPermissionEvaluator {
  evaluate(_request: PermissionRequest): PermissionDecision {
    return { allowed: true };
  }
}
