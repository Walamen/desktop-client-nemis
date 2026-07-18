import { Entity } from '../../core';
import type { GradeAuditAction } from '@nemis-desktop/types';

interface GradeAuditProps {
  id: string;
  gradeId: string;
  action: GradeAuditAction;
  changedBy: string;
  changedAt: string;
}

export class GradeAudit extends Entity<string> {
  #props: GradeAuditProps;

  private constructor(props: GradeAuditProps) {
    super(props.id);
    this.#props = props;
  }

  static reconstitute(props: GradeAuditProps): GradeAudit {
    return new GradeAudit(props);
  }

  get action(): GradeAuditAction {
    return this.#props.action;
  }
  get changedBy(): string {
    return this.#props.changedBy;
  }
  get changedAt(): string {
    return this.#props.changedAt;
  }
}
