export abstract class ValueObject<TProps extends object> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  /** Structural equality. Props are small, JSON-serialisable records built the same
   * way each time, so key order is stable and JSON comparison is sufficient. */
  equals(other?: ValueObject<TProps>): boolean {
    if (!other) return false;
    if (this === other) return true;
    if (this.constructor !== other.constructor) return false;
    // JSON.stringify comparison is order-sensitive (key insertion order matters) and
    // drops `undefined`-valued keys entirely, so this is only safe for VOs whose props
    // object is built with the same key order and shape on every construction.
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
