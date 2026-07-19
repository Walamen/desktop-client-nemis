export type PresentationErrorKind =
  | 'validation'
  | 'permission'
  | 'operation-failed'
  | 'loading'
  | 'network-unavailable'
  | 'unexpected'
  | 'not-implemented';

/** Base for every error the presentation layer surfaces to the UI.
 * `userMessage` is always safe and understandable for end users; raw causes
 * stay on `cause` for logs. Satisfies core's PresentationErrorLike. */
export abstract class PresentationError extends Error {
  readonly kind: PresentationErrorKind;
  readonly userMessage: string;

  protected constructor(
    kind: PresentationErrorKind,
    userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
    this.name = new.target.name;
    this.kind = kind;
    this.userMessage = userMessage;
  }
}

export class ValidationError extends PresentationError {
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(userMessage: string, fieldErrors: Readonly<Record<string, string>> = {}) {
    super('validation', userMessage);
    this.fieldErrors = fieldErrors;
  }
}

export class PermissionError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('permission', userMessage, options);
  }
}

/** A business rule or workflow precondition rejected the action; the message
 * comes from the application layer and is renderer-safe. */
export class OperationFailedError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('operation-failed', userMessage, options);
  }
}

export class LoadingError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('loading', userMessage, options);
  }
}

/** Reserved for future IPC/REST transports; nothing maps to it yet. */
export class NetworkUnavailableError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('network-unavailable', userMessage, options);
  }
}

export class UnexpectedPresentationError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('unexpected', userMessage, options);
  }
}

/** Thrown by extension-point ViewModels whose domain has not been built yet. */
export class NotImplementedPresentationError extends PresentationError {
  constructor(feature: string) {
    super('not-implemented', `${feature} is not available yet.`);
  }
}
