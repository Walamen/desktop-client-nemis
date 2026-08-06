import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Marks a locally-staged attachment not yet uploaded to the backend,
 * distinguishing it from a real remote (Cloudinary) URL everywhere
 * attachmentUrl is read — see AssignmentSyncService, which swaps this for
 * the real URL once the push succeeds. */
export const LOCAL_FILE_PREFIX = 'local-file://';

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB
// Matches the document types the web assignment form's FileUploadZone accepts.
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);

/** Copies teacher-picked assignment attachments into this workspace's own
 * storage so they're usable offline immediately, before the (possibly much
 * later) background sync upload succeeds. One instance per active
 * workspace — never shared across identities. */
export class AttachmentStorage {
  constructor(private readonly workspaceDir: string) {}

  /** Validates and copies `sourcePath` into `<workspaceDir>/attachments/`,
   * returning the `local-file://`-prefixed marker to store as
   * attachmentUrl. Throws on anything not a small, allowed-type regular
   * file — this path only ever runs against a file the OS's own native
   * picker just returned, but is validated as if it hadn't been. */
  stage(sourcePath: string): { attachmentUrl: string; attachmentName: string } {
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile()) throw new Error('Attachment must be a regular file.');
    if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error('Attachment exceeds the 20MB limit.');
    const extension = path.extname(sourcePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error(`Attachment type "${extension}" is not allowed.`);
    }

    const name = path.basename(sourcePath);
    const dir = path.join(this.workspaceDir, 'attachments');
    fs.mkdirSync(dir, { recursive: true });
    const destination = path.join(dir, `${randomUUID()}-${name}`);
    fs.copyFileSync(sourcePath, destination);
    return { attachmentUrl: `${LOCAL_FILE_PREFIX}${destination}`, attachmentName: name };
  }

  /** The real filesystem path when `attachmentUrl` is a local marker;
   * undefined for a real remote URL (or no attachment at all). */
  static localPath(attachmentUrl: string | undefined | null): string | undefined {
    return attachmentUrl?.startsWith(LOCAL_FILE_PREFIX)
      ? attachmentUrl.slice(LOCAL_FILE_PREFIX.length)
      : undefined;
  }
}
