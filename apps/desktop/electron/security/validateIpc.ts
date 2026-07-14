import { IPCError } from '@nemis-desktop/shared';

/** Rejects IPC calls that pass unexpected arguments. Never trust renderer input. */
export function assertNoArgs(args: readonly unknown[]): void {
  if (args.length > 0) {
    throw new IPCError(`Expected no arguments, received ${args.length}.`);
  }
}
