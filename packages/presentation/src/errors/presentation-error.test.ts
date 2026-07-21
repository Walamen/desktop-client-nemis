import { describe, expect, it } from 'vitest';
import { DatabaseUnavailableError, NetworkUnavailableError, PresentationError } from './presentation-error';
import { toPresentationError } from './to-presentation-error';

describe('DatabaseUnavailableError', () => {
  it('has the database-unavailable kind and a user message', () => {
    const err = new DatabaseUnavailableError('The local database is unavailable.');
    expect(err).toBeInstanceOf(PresentationError);
    expect(err.kind).toBe('database-unavailable');
    expect(err.userMessage).toBe('The local database is unavailable.');
  });

  it('passes through toPresentationError unchanged', () => {
    const err = new DatabaseUnavailableError('down');
    expect(toPresentationError(err, 'query')).toBe(err);
    const net = new NetworkUnavailableError('offline');
    expect(toPresentationError(net, 'query')).toBe(net);
  });
});
