/** Saving a file the renderer generated (report exports) through the app's
 * native save dialog. The main process writes only where the user chooses. */
export interface SaveFileRequest {
  /** A bare file name ending .pdf, .xlsx or .docx; suggested in Downloads. */
  fileName: string;
  bytes: Uint8Array;
}

export type SaveFileResult = { saved: false } | { saved: true; path: string };
