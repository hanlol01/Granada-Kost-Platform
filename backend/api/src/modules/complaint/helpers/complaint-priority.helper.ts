import { ComplaintPriority } from '../types/complaint.types';

const CATEGORY_PRIORITY_OVERRIDES: Record<string, ComplaintPriority> = {
  security: 'urgent',
  electricity: 'high',
  water: 'high',
  ac: 'high',
  internet: 'medium',
  common_facility: 'medium',
  cleanliness: 'low',
};

export class ComplaintPriorityHelper {
  static fromCategory(defaultPriority: ComplaintPriority, normalizedCode?: string | null): ComplaintPriority {
    if (!normalizedCode) {
      return defaultPriority;
    }

    return CATEGORY_PRIORITY_OVERRIDES[normalizedCode] ?? defaultPriority;
  }

  static isHigherPriority(left: ComplaintPriority, right: ComplaintPriority): boolean {
    return this.rank(left) > this.rank(right);
  }

  private static rank(priority: ComplaintPriority): number {
    return { low: 1, medium: 2, high: 3, urgent: 4 }[priority];
  }
}
