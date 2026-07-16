import { IPCError } from '@nemis-desktop/shared';

/** Rejects IPC calls that pass unexpected arguments. Never trust renderer input. */
export function assertNoArgs(args: readonly unknown[]): void {
  if (args.length > 0) {
    throw new IPCError(`Expected no arguments, received ${args.length}.`);
  }
}

const MAX_SETTING_KEY_LENGTH = 128;

/** Exactly one bounded, non-empty string argument: an app-settings key. */
export function assertSettingKeyArg(args: readonly unknown[]): void {
  if (args.length !== 1) {
    throw new IPCError(`Expected exactly 1 argument, received ${args.length}.`);
  }
  const [key] = args;
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_SETTING_KEY_LENGTH) {
    throw new IPCError(
      `Expected a non-empty string key (max ${MAX_SETTING_KEY_LENGTH} characters).`,
    );
  }
}
