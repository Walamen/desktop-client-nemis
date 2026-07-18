import { ApplicationException } from './application-exception';

/** An error the application layer did not anticipate. The pipeline wraps unknown
 * throwables in this so callers always receive an ApplicationException. */
export class UnexpectedApplicationException extends ApplicationException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('UNEXPECTED_ERROR', message, options);
  }
}
