/** Base for every error the application layer raises. `code` is a stable,
 * renderer-safe classifier that Phase 6 maps to IpcResult payloads. */
export abstract class ApplicationException extends Error {
  readonly code: string;

  protected constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}
