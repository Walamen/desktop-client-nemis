import path from 'node:path';
import type { SaveFileRequest, SaveFileResult } from '@nemis-desktop/types';

export interface FileSaveDeps {
  showSaveDialog(options: {
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }): Promise<{ canceled: boolean; filePath?: string }>;
  writeFile(filePath: string, bytes: Uint8Array): Promise<void>;
  downloadsDir(): string;
}

const FILTER_NAMES: Record<string, string> = {
  pdf: 'PDF document',
  xlsx: 'Excel workbook',
  docx: 'Word document',
};

/** Shows the native save dialog with the suggested name in Downloads and
 * writes the bytes only where the user chooses. `fileName` is validated
 * upstream (assertSaveFileArgs): a bare .pdf/.xlsx/.docx name. */
export async function saveFileWithDialog(request: SaveFileRequest, deps: FileSaveDeps): Promise<SaveFileResult> {
  const extension = path.extname(request.fileName).slice(1).toLowerCase();
  const choice = await deps.showSaveDialog({
    defaultPath: path.join(deps.downloadsDir(), request.fileName),
    filters: [{ name: FILTER_NAMES[extension] ?? extension.toUpperCase(), extensions: [extension] }],
  });
  if (choice.canceled || !choice.filePath) return { saved: false };
  await deps.writeFile(choice.filePath, request.bytes);
  return { saved: true, path: choice.filePath };
}
