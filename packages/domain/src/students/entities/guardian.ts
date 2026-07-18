import { AggregateRoot } from '../../core';
import { PersonName, PhoneNumber } from '../../value-objects';
import { guard } from '../../core';

export interface ReconstituteGuardianInput {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class Guardian extends AggregateRoot<string> {
  #name: PersonName;
  #relationship: string;
  #phone: PhoneNumber;

  private constructor(
    id: string,
    name: PersonName,
    relationship: string,
    phone: PhoneNumber,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#name = name;
    this.#relationship = relationship;
    this.#phone = phone;
  }

  static reconstitute(input: ReconstituteGuardianInput): Guardian {
    return new Guardian(
      input.id,
      PersonName.create({ firstName: input.firstName, lastName: input.lastName }),
      guard.againstEmpty(input.relationship, 'relationship'),
      PhoneNumber.create(input.phoneNumber),
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get name(): PersonName {
    return this.#name;
  }
  get relationship(): string {
    return this.#relationship;
  }
  get phone(): PhoneNumber {
    return this.#phone;
  }
}
