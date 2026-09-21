import { ValueObject } from '../../core';
import { BusinessRuleViolationException } from '../../exceptions';
import { normalizeNemisId } from '@nemis-desktop/shared';

interface NemisIdProps {
  value: string;
}

/** The student's permanent national identifier. Accepts formatted input and
 *  stores the canonical 12-digit form. */
export class NemisId extends ValueObject<NemisIdProps> {
  private constructor(props: NemisIdProps) {
    super(props);
  }

  static create(value: string): NemisId {
    const canonical = normalizeNemisId(value);
    if (canonical === null) {
      throw new BusinessRuleViolationException(
        `"${value}" is not a valid NEMIS ID.`,
      );
    }
    return new NemisId({ value: canonical });
  }

  get value(): string {
    return this.props.value;
  }
}
