import { COMPLAINT_SLA_TARGETS } from '../constants/complaint.constants';
import { ComplaintPriority } from '../types/complaint.types';

export type SlaDeadlineResult = {
  responseDueAt: Date;
  resolutionDueAt: Date;
};

export type SlaBreachResult = {
  responseSlaBreached: boolean;
  resolutionSlaBreached: boolean;
};

export class SlaCalculationHelper {
  static deadlines(priority: ComplaintPriority, submittedAt: Date): SlaDeadlineResult {
    const target = COMPLAINT_SLA_TARGETS[priority];
    return {
      responseDueAt: this.addHours(submittedAt, target.responseHours),
      resolutionDueAt: this.addHours(submittedAt, target.resolutionHours),
    };
  }

  static breachStatus(priority: ComplaintPriority, submittedAt: Date, comparedAt = new Date()): SlaBreachResult {
    const deadlines = this.deadlines(priority, submittedAt);
    return {
      responseSlaBreached: comparedAt > deadlines.responseDueAt,
      resolutionSlaBreached: comparedAt > deadlines.resolutionDueAt,
    };
  }

  private static addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }
}
