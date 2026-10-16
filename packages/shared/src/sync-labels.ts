/** Human labels for a sync payload, shared by the main process (pending
 * changes page) and the renderer (sync conflicts page) so both fall back to
 * the same text for a record they can't otherwise name. */
import { isPlainObject, unwrapLocalPayload } from './sync-conflict';

const NAME_KEYS = [
  'fullName', 'name', 'title', 'displayName',
  'studentName', 'staffName', 'className', 'subjectName',
];

/** "FEE_PAYMENT" -> "Fee Payment". */
export function humanizeEntityType(entityType: string): string {
  return entityType
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function pickEntityLabel(
  localPayload: unknown,
  remotePayload: unknown,
  entityType: string,
  entityId: string,
): string {
  const { edited, original } = unwrapLocalPayload(localPayload);
  for (const payload of [edited, original, remotePayload]) {
    if (!isPlainObject(payload)) continue;
    for (const key of NAME_KEYS) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    const first = payload['firstName'];
    const last = payload['lastName'];
    if ((typeof first === 'string' && first) || (typeof last === 'string' && last)) {
      return [first, last].filter((part) => typeof part === 'string' && part).join(' ');
    }
  }
  const shortId = entityId.length > 8 ? `${entityId.slice(0, 8)}…` : entityId;
  return `${humanizeEntityType(entityType)} · ${shortId}`;
}
