export class WorkOrderCodeGenerator {
  static format(propertyCode: string, year: number, sequence: number): string {
    return `WO-${propertyCode.toUpperCase()}-${year}-${String(sequence).padStart(4, '0')}`;
  }
}
