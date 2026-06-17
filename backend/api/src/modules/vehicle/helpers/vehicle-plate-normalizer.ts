export class VehiclePlateNormalizer {
  static normalize(plateNumber: string): string {
    return plateNumber.trim().toUpperCase().replace(/\s+/g, ' ');
  }
}
