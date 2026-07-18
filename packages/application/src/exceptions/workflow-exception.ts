import { ApplicationException } from './application-exception';

/** A precondition/orchestration rule failed (e.g. referenced entity missing,
 * duplicate not allowed) before or around the domain operation. */
export class WorkflowException extends ApplicationException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('WORKFLOW_ERROR', message, options);
  }
}
