import { Entity } from '../../core';

interface StudentGuardianProps {
  id: string;
  guardianId: string;
  isPrimary: boolean;
}

export class StudentGuardian extends Entity<string> {
  #props: StudentGuardianProps;

  private constructor(props: StudentGuardianProps) {
    super(props.id);
    this.#props = props;
  }

  static reconstitute(props: StudentGuardianProps): StudentGuardian {
    return new StudentGuardian(props);
  }

  get guardianId(): string {
    return this.#props.guardianId;
  }
  get isPrimary(): boolean {
    return this.#props.isPrimary;
  }
}
