import {
  ApplicationValidationException,
  PermissionDeniedException,
  UseCaseException,
  WorkflowException,
} from '@nemis-desktop/application';
import {
  LoadingError,
  OperationFailedError,
  PermissionError,
  PresentationError,
  UnexpectedPresentationError,
  ValidationError,
} from './presentation-error';

/** Single translation point from application-layer (and unknown) errors into
 * UI-friendly presentation errors. Queries degrade to LoadingError; commands
 * to UnexpectedPresentationError. */
export function toPresentationError(err: unknown, context: 'query' | 'command'): PresentationError {
  if (err instanceof PresentationError) return err;

  if (err instanceof ApplicationValidationException) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) fieldErrors[issue.field] = issue.message;
    return new ValidationError('Please correct the highlighted fields.', fieldErrors);
  }
  if (err instanceof PermissionDeniedException) {
    return new PermissionError('You do not have permission to perform this action.', {
      cause: err,
    });
  }
  if (err instanceof UseCaseException || err instanceof WorkflowException) {
    return new OperationFailedError(err.message, { cause: err });
  }
  return context === 'query'
    ? new LoadingError('Something went wrong while loading. Please try again.', { cause: err })
    : new UnexpectedPresentationError('Something went wrong. Please try again.', { cause: err });
}
