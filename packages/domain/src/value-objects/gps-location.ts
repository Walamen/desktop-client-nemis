import { ValueObject, guard } from '../core';

interface GpsProps {
  latitude: number;
  longitude: number;
}

export class GpsLocation extends ValueObject<GpsProps> {
  private constructor(props: GpsProps) {
    super(props);
  }

  static create(input: GpsProps): GpsLocation {
    return new GpsLocation({
      latitude: guard.range(input.latitude, -90, 90, 'latitude'),
      longitude: guard.range(input.longitude, -180, 180, 'longitude'),
    });
  }

  get latitude(): number {
    return this.props.latitude;
  }
  get longitude(): number {
    return this.props.longitude;
  }
}
