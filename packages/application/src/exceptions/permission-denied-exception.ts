import { ApplicationException } from './application-exception';

export class PermissionDeniedException extends ApplicationException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('PERMISSION_DENIED', message, options);
  }
}
