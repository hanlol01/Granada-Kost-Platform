export class VehicleCodeGenerator {
  static propertyCode(propertyName: string): string {
    return propertyName
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join('')
      .slice(0, 4)
      .toUpperCase();
  }

  static format(propertyCode: string, year: number, sequence: number): string {
    return `VEH-${propertyCode}-${year}-${sequence.toString().padStart(4, '0')}`;
  }
}
