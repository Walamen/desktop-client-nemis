import { InvalidValueObjectException } from '../exceptions';

function fail(message: string): never {
  throw new InvalidValueObjectException(message);
}

export const guard = {
  againstEmpty(value: string, field: string): string {
    const trimmed = (value ?? '').trim();
    if (trimmed.length === 0) fail(`${field} must not be empty`);
    return trimmed;
  },

  range(value: number, min: number, max: number, field: string): number {
    if (Number.isNaN(value) || value < min || value > max) {
      fail(`${field} must be between ${min} and ${max}`);
    }
    return value;
  },

  iso(value: string, field: string): string {
    const time = Date.parse(value);
    if (Number.isNaN(time)) fail(`${field} must be a valid ISO-8601 date`);
    return value;
  },

  notFuture(value: string, field: string): string {
    const time = Date.parse(value);
    if (Number.isNaN(time)) fail(`${field} must be a valid ISO-8601 date`);
    if (time > Date.now()) fail(`${field} must not be in the future`);
    return value;
  },
};
