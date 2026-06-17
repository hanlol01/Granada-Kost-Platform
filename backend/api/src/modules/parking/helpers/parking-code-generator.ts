export class ParkingCodeGenerator {
  static zoneCode(rawCode: string): string {
    return rawCode.trim().toUpperCase().replace(/\s+/g, '-');
  }

  static slotNumber(rawNumber: string): string {
    return rawNumber.trim().toUpperCase().replace(/\s+/g, '-');
  }
}
