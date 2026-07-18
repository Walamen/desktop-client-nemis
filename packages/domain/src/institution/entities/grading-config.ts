import { Entity } from '../../core';
import { EntityValidationException } from '../../exceptions';

interface GradingConfigProps {
  id: string;
  maxMarks: number;
  passingMarks: number;
  requireAdminApproval: boolean;
}

export class GradingConfig extends Entity<string> {
  #props: GradingConfigProps;

  private constructor(props: GradingConfigProps) {
    super(props.id);
    this.#props = props;
  }

  static reconstitute(props: GradingConfigProps): GradingConfig {
    if (props.passingMarks > props.maxMarks) {
      throw new EntityValidationException('passingMarks cannot exceed maxMarks', [
        { field: 'passingMarks', message: 'must be <= maxMarks' },
      ]);
    }
    return new GradingConfig(props);
  }

  get maxMarks(): number {
    return this.#props.maxMarks;
  }
  get passingMarks(): number {
    return this.#props.passingMarks;
  }
  get requireAdminApproval(): boolean {
    return this.#props.requireAdminApproval;
  }
}
