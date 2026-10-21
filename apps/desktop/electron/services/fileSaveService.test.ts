import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { IPCError } from '@nemis-desktop/shared';
import { saveFileWithDialog } from './fileSaveService';
import { assertSaveFileArgs } from '@app/security/validateIpc';

const DOWNLOADS = path.join('C:', 'Users', 'me', 'Downloads');

function deps(choice: { canceled: boolean; filePath?: string }) {
  return {
    showSaveDialog: vi.fn(async () => choice),
    writeFile: vi.fn(async () => undefined),
    downloadsDir: () => DOWNLOADS,
  };
}

describe('saveFileWithDialog', () => {
  it('writes the bytes where the user chose and returns the path', async () => {
    const d = deps({ canceled: false, filePath: 'D:\\Reports\\enrollment.pdf' });
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const result = await saveFileWithDialog({ fileName: 'Grand-Bassa-enrollment.pdf', bytes }, d);
    expect(d.showSaveDialog).toHaveBeenCalledWith({
      defaultPath: path.join(DOWNLOADS, 'Grand-Bassa-enrollment.pdf'),
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
    });
    expect(d.writeFile).toHaveBeenCalledWith('D:\\Reports\\enrollment.pdf', bytes);
    expect(result).toEqual({ saved: true, path: 'D:\\Reports\\enrollment.pdf' });
  });

  it('names the filter after the file type', async () => {
    const d = deps({ canceled: true });
    await saveFileWithDialog({ fileName: 'r.xlsx', bytes: new Uint8Array() }, d);
    await saveFileWithDialog({ fileName: 'r.docx', bytes: new Uint8Array() }, d);
    expect(d.showSaveDialog.mock.calls.map((c) => (c as unknown as [{ filters: unknown }])[0].filters)).toEqual([
      [{ name: 'Excel workbook', extensions: ['xlsx'] }],
      [{ name: 'Word document', extensions: ['docx'] }],
    ]);
  });

  it('a cancelled dialog writes nothing and returns saved false', async () => {
    const d = deps({ canceled: true });
    expect(await saveFileWithDialog({ fileName: 'r.pdf', bytes: new Uint8Array([1]) }, d)).toEqual({ saved: false });
    expect(d.writeFile).not.toHaveBeenCalled();
  });
});

describe('assertSaveFileArgs', () => {
  const ok = new Uint8Array([1, 2, 3]);

  it('accepts a bare pdf, xlsx or docx name with bytes', () => {
    for (const fileName of ['a.pdf', 'Grand-Bassa-enrollment-report-county-2026-10-20.xlsx', 'b c.docx']) {
      expect(() => assertSaveFileArgs([{ fileName, bytes: ok }])).not.toThrow();
    }
  });

  it('refuses paths, traversal and other extensions before any dialog', () => {
    for (const fileName of ['../x.pdf', 'a/b.pdf', 'a\\b.pdf', 'x.exe', 'x.pdf.exe', 'C:x.pdf', '..pdf', '']) {
      expect(() => assertSaveFileArgs([{ fileName, bytes: ok }])).toThrow(IPCError);
    }
    expect(() => assertSaveFileArgs([{ fileName: `${'a'.repeat(201)}.pdf`, bytes: ok }])).toThrow(IPCError);
  });

  it('refuses non-bytes, oversize and unknown keys', () => {
    expect(() => assertSaveFileArgs([{ fileName: 'a.pdf', bytes: [1, 2] }])).toThrow(IPCError);
    expect(() => assertSaveFileArgs([{ fileName: 'a.pdf', bytes: 'abc' }])).toThrow(IPCError);
    expect(() => assertSaveFileArgs([{ fileName: 'a.pdf', bytes: new Uint8Array(50 * 1024 * 1024 + 1) }])).toThrow(IPCError);
    expect(() => assertSaveFileArgs([{ fileName: 'a.pdf', bytes: ok, path: 'C:\\' }])).toThrow(IPCError);
    expect(() => assertSaveFileArgs([])).toThrow(IPCError);
  });
});
