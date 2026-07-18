import { describe, expect, it } from 'vitest';
import type { CommandHandler, QueryHandler } from './command';
import type { QueryHandler as QH } from './query';

describe('CQRS base types', () => {
  it('a command handler is awaitable and returns its result type', async () => {
    const handler: CommandHandler<{ n: number }, number> = {
      execute: (c) => Promise.resolve(c.n + 1),
    };
    await expect(handler.execute({ n: 1 })).resolves.toBe(2);
  });

  it('a query handler is awaitable and returns its result type', async () => {
    const handler: QH<{ id: string }, string> = {
      execute: (q) => Promise.resolve(q.id.toUpperCase()),
    };
    await expect(handler.execute({ id: 'ab' })).resolves.toBe('AB');
  });
});
