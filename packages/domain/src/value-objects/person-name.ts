import { ValueObject, guard } from '../core';

interface PersonNameProps {
  firstName: string;
  lastName: string;
  middleName?: string;
}

export class PersonName extends ValueObject<PersonNameProps> {
  private constructor(props: PersonNameProps) {
    super(props);
  }

  static create(input: PersonNameProps): PersonName {
    const middle = input.middleName?.trim();
    return new PersonName({
      firstName: guard.againstEmpty(input.firstName, 'firstName'),
      lastName: guard.againstEmpty(input.lastName, 'lastName'),
      middleName: middle && middle.length > 0 ? middle : undefined,
    });
  }

  get firstName(): string {
    return this.props.firstName;
  }
  get lastName(): string {
    return this.props.lastName;
  }
  get middleName(): string | undefined {
    return this.props.middleName;
  }
  get full(): string {
    return [this.props.firstName, this.props.middleName, this.props.lastName]
      .filter((p): p is string => !!p)
      .join(' ');
  }
}
