export class SmartLockCodeGenerator {
  static deviceName(roomNumber: string): string {
    return `Smart Lock ${roomNumber.trim().toUpperCase()}`;
  }

  static credentialLabel(type: string, ownerLabel: string, date = new Date()): string {
    const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
    return `${type.toUpperCase()}-${ownerLabel.trim().toUpperCase()}-${stamp}`;
  }

  static restrictionReference(propertyCode: string, sequence: number): string {
    return `SLR-${propertyCode.trim().toUpperCase()}-${sequence.toString().padStart(5, '0')}`;
  }
}
