export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Base for every domain-layer error. Carries a stable `code` (mirrors the shape of
 * the infra `ApplicationError` so a future IPC adapter can map codes) but does NOT
 * import infrastructure — the domain must stay dependency-free.
 */
export abstract class DomainException extends Error {
  readonly code: string;

  protected constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class BusinessRuleViolationException extends DomainException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('BUSINESS_RULE_VIOLATION', message, options);
  }
}

export class InvalidStateException extends DomainException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('INVALID_STATE', message, options);
  }
}

export class InvalidValueObjectException extends DomainException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('INVALID_VALUE_OBJECT', message, options);
  }
}

export class EntityValidationException extends DomainException {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = [], options?: { cause?: unknown }) {
    super('ENTITY_VALIDATION', message, options);
    this.issues = issues;
  }
}
