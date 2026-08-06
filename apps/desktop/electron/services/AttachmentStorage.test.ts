import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentStorage, LOCAL_FILE_PREFIX } from './AttachmentStorage';

describe('AttachmentStorage', () => {
  let sourceDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-attachment-source-'));
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-attachment-workspace-'));
  });

  afterEach(() => {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('copies an allowed file into the workspace and returns a local-file:// marker', () => {
    const sourcePath = path.join(sourceDir, 'homework.pdf');
    fs.writeFileSync(sourcePath, 'pdf-bytes');

    const staged = new AttachmentStorage(workspaceDir).stage(sourcePath);

    expect(staged.attachmentName).toBe('homework.pdf');
    expect(staged.attachmentUrl.startsWith(LOCAL_FILE_PREFIX)).toBe(true);
    const copiedPath = staged.attachmentUrl.slice(LOCAL_FILE_PREFIX.length);
    expect(fs.readFileSync(copiedPath, 'utf8')).toBe('pdf-bytes');
    expect(copiedPath).not.toBe(sourcePath); // a real copy, not the original
  });

  it('rejects a disallowed file extension', () => {
    const sourcePath = path.join(sourceDir, 'virus.exe');
    fs.writeFileSync(sourcePath, 'x');
    expect(() => new AttachmentStorage(workspaceDir).stage(sourcePath)).toThrow(/not allowed/);
  });

  it('rejects a file over the size limit', () => {
    const sourcePath = path.join(sourceDir, 'big.pdf');
    fs.writeFileSync(sourcePath, Buffer.alloc(21 * 1024 * 1024));
    expect(() => new AttachmentStorage(workspaceDir).stage(sourcePath)).toThrow(/20MB/);
  });

  it('rejects a directory', () => {
    const dirPath = path.join(sourceDir, 'not-a-file.pdf');
    fs.mkdirSync(dirPath);
    expect(() => new AttachmentStorage(workspaceDir).stage(dirPath)).toThrow(/regular file/);
  });

  describe('localPath', () => {
    it('extracts the real path from a local-file:// marker', () => {
      expect(AttachmentStorage.localPath(`${LOCAL_FILE_PREFIX}/tmp/notes.pdf`)).toBe('/tmp/notes.pdf');
    });
    it('returns undefined for a remote URL or missing value', () => {
      expect(AttachmentStorage.localPath('https://cdn.example/notes.pdf')).toBeUndefined();
      expect(AttachmentStorage.localPath(undefined)).toBeUndefined();
    });
  });
});
