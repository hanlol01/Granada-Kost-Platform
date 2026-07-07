import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { CreatePublicBookingLeadDto } from './dto/create-public-booking-lead.dto';
import { ListBookingLeadsQueryDto } from './dto/list-booking-leads-query.dto';
import { BookingLeadRepository } from './repositories/booking-lead.repository';
import {
  BookingLeadGender,
  BookingLeadRecord,
  BookingLeadRequestContext,
  BookingLeadStatus,
} from './types/booking-lead.types';

const DUPLICATE_WINDOW_MINUTES = 15;
const PUBLIC_SUCCESS_MESSAGE = 'Terima kasih, admin akan menghubungi Anda via WhatsApp.';
const TERMINAL_STATUSES: BookingLeadStatus[] = ['converted', 'rejected', 'expired'];
const ALLOWED_TRANSITIONS: Record<BookingLeadStatus, BookingLeadStatus[]> = {
  new: ['contacted', 'rejected', 'expired'],
  contacted: ['visit_scheduled', 'rejected', 'expired'],
  visit_scheduled: ['converted', 'rejected', 'expired'],
  converted: [],
  rejected: [],
  expired: [],
};

@Injectable()
export class BookingLeadService {
  constructor(
    private readonly leads: BookingLeadRepository,
    private readonly audit: AuditRepository,
  ) {}

  async createPublicLead(dto: CreatePublicBookingLeadDto, context: BookingLeadRequestContext) {
    const input = this.normalizePublicLeadInput(dto);
    const propertyId = await this.leads.resolvePublicPropertyId(input);

    if (!propertyId) {
      throw new ServiceUnavailableException({
        code: 'BOOKING_LEAD_PROPERTY_UNAVAILABLE',
        message: 'Booking interest submission is temporarily unavailable.',
      });
    }

    const duplicate = await this.leads.findRecentDuplicate(
      {
        propertyId,
        category: input.category,
        gender: input.gender,
        visitorPhone: input.visitorPhone,
        publicGroupKey: input.publicGroupKey,
      },
      DUPLICATE_WINDOW_MINUTES,
    );

    if (duplicate) {
      return this.publicResponse(duplicate);
    }

    const lead = await this.leads.create({
      ...input,
      propertyId,
      source: 'public_kamar',
      metadata: {
        submittedContext: {
          category: input.category,
          gender: input.gender,
          buildingCode: input.buildingCode ?? null,
          floorCode: input.floorCode ?? null,
          publicGroupKey: input.publicGroupKey ?? null,
        },
      },
    });

    await this.audit.write({
      propertyId: lead.propertyId,
      action: 'booking_lead.create_public',
      resourceType: 'booking_lead',
      resourceId: lead.id,
      afterData: this.publicAuditSnapshot(lead),
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    return this.publicResponse(lead);
  }

  listAdminLeads(propertyIds: string[], query: ListBookingLeadsQueryDto) {
    this.assertDateRange(query.dateFrom, query.dateTo);
    return this.leads
      .listForProperties(propertyIds, {
        status: query.status,
        category: query.category,
        gender: query.gender,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        search: query.search,
        limit: query.limit,
        offset: query.offset,
      })
      .then((leads) => leads.map((lead) => this.adminResponse(lead)));
  }

  async get(leadId: string): Promise<BookingLeadRecord> {
    const lead = await this.leads.findById(leadId);
    if (!lead) {
      throw new NotFoundException({ code: 'BOOKING_LEAD_NOT_FOUND', message: 'Booking lead not found' });
    }
    return lead;
  }

  async updateStatus(
    current: BookingLeadRecord,
    status: BookingLeadStatus,
    context: BookingLeadRequestContext,
  ) {
    if (current.status === status) {
      return this.adminResponse(current);
    }

    this.assertCanTransition(current.status, status);
    const updated = await this.leads.updateStatus(current.id, status);

    if (!updated) {
      throw new NotFoundException({ code: 'BOOKING_LEAD_NOT_FOUND', message: 'Booking lead not found' });
    }

    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: updated.propertyId,
      action: 'booking_lead.status_update',
      resourceType: 'booking_lead',
      resourceId: updated.id,
      beforeData: { id: current.id, status: current.status },
      afterData: { id: updated.id, status: updated.status },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    return this.adminResponse(updated);
  }

  private normalizePublicLeadInput(dto: CreatePublicBookingLeadDto) {
    const category = dto.category;
    const gender = this.normalizeGender(dto.gender);
    const preferredMoveInDate = dto.preferredMoveInDate
      ? this.assertDate(dto.preferredMoveInDate, 'preferredMoveInDate')
      : undefined;

    return {
      category,
      gender,
      buildingCode: dto.buildingCode,
      floorCode: dto.floorCode,
      publicGroupKey: dto.publicGroupKey,
      visitorName: this.sanitizeText(dto.visitorName, 120),
      visitorPhone: this.normalizeIndonesianPhone(dto.visitorPhone),
      visitorMessage: dto.visitorMessage ? this.sanitizeText(dto.visitorMessage, 1000) : undefined,
      preferredMoveInDate,
    };
  }

  private normalizeGender(gender: string): BookingLeadGender {
    if (gender === 'putra' || gender === 'male') return 'male';
    return 'female';
  }

  private normalizeIndonesianPhone(rawPhone: string): string {
    const compact = rawPhone.trim().replace(/[\s().-]/g, '');
    if (!/^\+?\d+$/.test(compact)) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_PHONE_INVALID',
        message: 'Visitor phone must be a valid Indonesian WhatsApp number.',
      });
    }

    let normalized = compact;
    if (normalized.startsWith('+62')) {
      normalized = normalized.slice(1);
    } else if (normalized.startsWith('0')) {
      normalized = `62${normalized.slice(1)}`;
    }

    if (!normalized.startsWith('62') || normalized.length < 10 || normalized.length > 15) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_PHONE_INVALID',
        message: 'Visitor phone must be a valid Indonesian WhatsApp number.',
      });
    }

    return normalized;
  }

  private sanitizeText(value: string, maxLength: number): string {
    const withoutControlCharacters = Array.from(value)
      .map((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? ' ' : character;
      })
      .join('');
    return withoutControlCharacters.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  private assertDate(value: string, field: string): string {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_DATE_INVALID',
        message: `${field} must be a valid date.`,
      });
    }
    return value;
  }

  private assertDateRange(dateFrom?: string, dateTo?: string): void {
    const from = dateFrom ? this.assertDate(dateFrom, 'dateFrom') : undefined;
    const to = dateTo ? this.assertDate(dateTo, 'dateTo') : undefined;
    if (from && to && from > to) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_DATE_RANGE_INVALID',
        message: 'dateFrom must be before or equal to dateTo.',
      });
    }
  }

  private assertCanTransition(from: BookingLeadStatus, to: BookingLeadStatus): void {
    if (TERMINAL_STATUSES.includes(from)) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_STATUS_TERMINAL',
        message: 'Terminal booking lead status cannot be changed in MVP.',
      });
    }

    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_STATUS_TRANSITION_INVALID',
        message: 'Booking lead status transition is not allowed.',
      });
    }
  }

  private publicResponse(lead: BookingLeadRecord) {
    return {
      id: lead.id,
      status: lead.status,
      category: lead.category,
      gender: lead.gender,
      createdAt: lead.createdAt,
      message: PUBLIC_SUCCESS_MESSAGE,
    };
  }

  private adminResponse(lead: BookingLeadRecord) {
    return {
      id: lead.id,
      propertyId: lead.propertyId,
      category: lead.category,
      gender: lead.gender,
      buildingCode: lead.buildingCode,
      floorCode: lead.floorCode,
      publicGroupKey: lead.publicGroupKey,
      visitorName: lead.visitorName,
      visitorPhone: lead.visitorPhone,
      visitorMessage: lead.visitorMessage,
      preferredMoveInDate: lead.preferredMoveInDate,
      status: lead.status,
      source: lead.source,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }

  private publicAuditSnapshot(lead: BookingLeadRecord): Record<string, unknown> {
    return {
      id: lead.id,
      status: lead.status,
      category: lead.category,
      gender: lead.gender,
      buildingCode: lead.buildingCode,
      floorCode: lead.floorCode,
      publicGroupKey: lead.publicGroupKey,
      maskedPhone: this.maskPhone(lead.visitorPhone),
      source: lead.source,
    };
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 6) return '***';
    return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
  }
}
