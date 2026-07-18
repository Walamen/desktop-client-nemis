import { ApplicationException } from './application-exception';

/** A use case failed for a reason surfaced to the caller (often a translated
 * domain rule violation). */
export class UseCaseException extends ApplicationException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('USE_CASE_ERROR', message, options);
  }
}
