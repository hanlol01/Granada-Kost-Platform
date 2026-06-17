export class ComplaintCodeGenerator {
  static format(propertyCode: string, year: number, sequence: number): string {
    return `TKT-${propertyCode.toUpperCase()}-${year}-${String(sequence).padStart(4, '0')}`;
  }

  static propertyCode(propertyName: string): string {
    const words = propertyName
      .split(/\s+/)
      .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean);

    if (words.length === 0) {
      return 'PROP';
    }

    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }
}
