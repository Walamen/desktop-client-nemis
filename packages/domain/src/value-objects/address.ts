import { ValueObject } from '../core';

interface AddressProps {
  street?: string;
  communityTown?: string;
}

export class Address extends ValueObject<AddressProps> {
  private constructor(props: AddressProps) {
    super(props);
  }

  static create(input: AddressProps): Address {
    const street = input.street?.trim();
    const communityTown = input.communityTown?.trim();
    return new Address({
      street: street && street.length > 0 ? street : undefined,
      communityTown: communityTown && communityTown.length > 0 ? communityTown : undefined,
    });
  }

  get street(): string | undefined {
    return this.props.street;
  }
  get communityTown(): string | undefined {
    return this.props.communityTown;
  }
  get isEmpty(): boolean {
    return !this.props.street && !this.props.communityTown;
  }
}
