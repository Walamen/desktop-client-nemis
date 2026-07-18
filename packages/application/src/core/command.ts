export type { QueryHandler } from './query';

/** Marker for a state-changing intent object. */
export type Command = Readonly<Record<string, unknown>>;

export interface CommandHandler<TCommand, TResult> {
  execute(command: TCommand): Promise<TResult>;
}
