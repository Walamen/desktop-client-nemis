import { ForbiddenError } from '@nemis-desktop/shared';

/**
 * The ONLY place renderer access to settings keys is decided. A setting is
 * never renderer-readable merely because it exists in the database — it must
 * be listed here. Extend by adding the key to this set (and nothing else).
 */
export const RENDERER_READABLE_SETTINGS: ReadonlySet<string> = new Set(['theme', 'language']);

export function assertRendererReadableSetting(key: string): void {
  if (!RENDERER_READABLE_SETTINGS.has(key)) {
    throw new ForbiddenError(`Setting "${key}" is not accessible from the renderer.`);
  }
}
