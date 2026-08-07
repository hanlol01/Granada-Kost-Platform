import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { CreateAdminBookingLeadDto } from './dto/create-admin-booking-lead.dto';
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
const TERMINAL_STATUSES: BookingLeadStatus[] = [
  'converted',
  'rejected',
  'expired',
  'leased',
  'cancelled',
];
const ALLOWED_TRANSITIONS: Record<BookingLeadStatus, BookingLeadStatus[]> = {
  new: ['contacted', 'rejected', 'expired'],
  contacted: ['rejected', 'expired'],
  visit_scheduled: [],
  negotiating: [],
  awaiting_dp: [],
  onboarding: [],
  leased: [],
  converted: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

@Injectable()
export class BookingLeadService {
  constructor(
    private readonly leads: BookingLeadRepository,
    private readonly audit: AuditRepository,
  ) {}

  async createAdminLead(
    dto: CreateAdminBookingLeadDto,
    context: BookingLeadRequestContext & { actorUserId: string },
  ) {
    const room = await this.leads.findAdminRoom(dto.property_id, dto.room_id);
    if (!room) {
      throw new NotFoundException({
        code: 'BOOKING_LEAD_ROOM_NOT_FOUND',
        message: 'Room is not available within the authorized property.',
      });
    }

    if (
      !room.buildingId ||
      !room.buildingCode ||
      !room.category ||
      room.buildingCategory !== room.category ||
      room.buildingGenderPolicy !== room.genderPolicy
    ) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_ROOM_BUILDING_REQUIRED',
        message: 'Room must have an authoritative building reference.',
      });
    }

    if (room.roomStatus !== 'vacant') {
      throw new ConflictException({
        code: 'BOOKING_LEAD_ROOM_NOT_VACANT',
        message: 'Booking interest can only be recorded for a vacant room.',
      });
    }

    if (dto.gender !== room.genderPolicy) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_GENDER_MISMATCH',
        message: 'Visitor gender does not match the room gender policy.',
      });
    }

    const result = await this.leads.findOrCreateAdminLead(
      {
        propertyId: room.propertyId,
        roomId: room.id,
        roomNumber: room.roomNumber,
        category: room.category,
        gender: dto.gender,
        buildingCode: room.buildingCode,
        floorCode: room.floorCode,
        visitorName: this.sanitizeText(dto.visitor_name, 120),
        visitorPhone: this.normalizeIndonesianPhone(dto.visitor_phone),
        visitorAddress: this.sanitizeText(dto.visitor_address, 500),
        visitorUniversity: dto.visitor_university
          ? this.sanitizeText(dto.visitor_university, 160)
          : undefined,
        createdByUserId: context.actorUserId,
      },
      DUPLICATE_WINDOW_MINUTES,
    );

    if (result.created) {
      await this.audit.write({
        actorUserId: context.actorUserId,
        propertyId: result.lead.propertyId,
        action: 'booking_lead.create_admin',
        resourceType: 'booking_lead',
        resourceId: result.lead.id,
        afterData: {
          id: result.lead.id,
          status: result.lead.status,
          source: result.lead.source,
        },
        resultStatus: 'success',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
      });
    }

    return this.adminResponse(result.lead, room.roomNumber);
  }

  async createPublicLead(dto: CreatePublicBookingLeadDto, context: BookingLeadRequestContext) {
    if (
      context.idempotencyKey !== undefined &&
      !/^[A-Za-z0-9._~-]{16,128}$/.test(context.idempotencyKey)
    ) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_IDEMPOTENCY_KEY_INVALID',
        message: 'Submission identity is invalid.',
      });
    }
    if (dto.consent !== true) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_CONSENT_REQUIRED',
        message: 'Contact consent is required.',
      });
    }
    const input = this.normalizePublicLeadInput(dto);
    const requestFingerprint = this.publicRequestFingerprint(input);
    const result = await this.leads.transaction(async (client) => {
      const propertyId = await this.leads.resolvePublicPropertyId(input, client);
      if (!propertyId) {
        throw new ServiceUnavailableException({
          code: 'BOOKING_LEAD_PROPERTY_UNAVAILABLE',
          message: 'Booking interest submission is temporarily unavailable.',
        });
      }
      await this.leads.lockPublicCreation(client, {
        propertyId,
        category: input.category,
        gender: input.gender,
        visitorPhone: input.visitorPhone,
        idempotencyKey: context.idempotencyKey,
      });

      if (context.idempotencyKey) {
        const replay = await this.leads.findByPublicIdempotencyKey(
          propertyId,
          context.idempotencyKey,
          client,
        );
        if (replay) {
          if (replay.metadata?.requestFingerprint !== requestFingerprint) {
            throw new ConflictException({
              code: 'BOOKING_LEAD_IDEMPOTENCY_KEY_REUSED',
              message: 'Submission identity has already been used for different data.',
            });
          }
          return { lead: replay, created: false };
        }
      }

      const duplicate = await this.leads.findRecentDuplicate(
        {
          propertyId,
          category: input.category,
          gender: input.gender,
          visitorPhone: input.visitorPhone,
          publicGroupKey: undefined,
        },
        DUPLICATE_WINDOW_MINUTES,
        client,
      );
      if (duplicate) return { lead: duplicate, created: false };

      const lead = await this.leads.create(
        {
          ...input,
          propertyId,
          source: 'public_kamar',
          metadata: {
            idempotencyKey: context.idempotencyKey ?? null,
            requestFingerprint,
            submittedContext: {
              category: input.category,
              gender: input.gender,
            },
          },
        },
        client,
      );

      await this.audit.write(
        {
          propertyId: lead.propertyId,
          action: 'booking_lead.create_public',
          resourceType: 'booking_lead',
          resourceId: lead.id,
          afterData: this.publicAuditSnapshot(lead),
          resultStatus: 'success',
          correlationId: context.correlationId,
        },
        client,
      );
      await this.leads.writePublicCreatedEvent(client, {
        lead,
        correlationId: context.correlationId,
      });
      return { lead, created: true };
    });

    return this.publicResponse(result.lead);
  }

  listAdminLeads(propertyIds: string[], query: ListBookingLeadsQueryDto) {
    this.assertDateRange(query.dateFrom, query.dateTo);
    return this.leads
      .listForProperties(propertyIds, {
        status: query.status,
        category: query.category,
        gender: query.gender,
        source: query.source,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        search: query.search,
        limit: query.limit,
        offset: query.offset,
      })
      .then((leads) => leads.map((lead) => this.adminResponse(lead)));
  }

  async listAdminLeadPage(propertyIds: string[], query: ListBookingLeadsQueryDto) {
    this.assertDateRange(query.dateFrom, query.dateTo);
    const page = await this.leads.listPageForProperties(propertyIds, {
      status: query.status,
      category: query.category,
      gender: query.gender,
      source: query.source,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
    return {
      data: page.data.map((lead) => this.adminResponse(lead)),
      limit: page.limit,
      offset: page.offset,
      total: page.total,
    };
  }

  async get(leadId: string): Promise<BookingLeadRecord> {
    const lead = await this.leads.findById(leadId);
    if (!lead) {
      throw new NotFoundException({
        code: 'BOOKING_LEAD_NOT_FOUND',
        message: 'Booking lead not found',
      });
    }
    return lead;
  }

  async getForProperty(leadId: string, propertyId: string): Promise<BookingLeadRecord> {
    const lead = await this.leads.findForProperty(leadId, propertyId);
    if (!lead) {
      throw new NotFoundException({
        code: 'BOOKING_LEAD_NOT_FOUND',
        message: 'Booking lead not found',
      });
    }
    return lead;
  }

  async updateStatusCommand(
    current: BookingLeadRecord,
    status: BookingLeadStatus,
    rawIdempotencyKey: string | undefined,
    context: BookingLeadRequestContext & { actorUserId: string },
  ) {
    const idempotencyKey = this.requireIdempotencyKey(rawIdempotencyKey);
    const route = 'PATCH /booking-leads/:leadId/status';
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          actor_id: context.actorUserId,
          booking_lead_id: current.id,
          property_id: current.propertyId,
          status,
        }),
      )
      .digest('hex');

    return this.leads.transaction(async (client) => {
      const claim = await this.leads.claimStatusCommand(client, {
        propertyId: current.propertyId,
        actorUserId: context.actorUserId,
        route,
        idempotencyKey,
        fingerprint,
        correlationId: context.correlationId,
      });
      if (claim) return this.replayStatusCommand(claim, fingerprint);

      const locked = await this.leads.findForProperty(current.id, current.propertyId, client, true);
      if (!locked) {
        throw new NotFoundException({
          code: 'BOOKING_LEAD_NOT_FOUND',
          message: 'Booking lead not found',
        });
      }
      if (locked.status !== status) this.assertCanTransition(locked.status, status);
      const updated =
        locked.status === status
          ? locked
          : await this.leads.updateStatusForProperty(client, locked.id, locked.propertyId, status);
      if (!updated) {
        throw new NotFoundException({
          code: 'BOOKING_LEAD_NOT_FOUND',
          message: 'Booking lead not found',
        });
      }
      const response = this.adminResponse(updated);
      if (locked.status !== updated.status) {
        await this.audit.write(
          {
            actorUserId: context.actorUserId,
            propertyId: updated.propertyId,
            action: 'booking_lead.status_update',
            resourceType: 'booking_lead',
            resourceId: updated.id,
            beforeData: { id: locked.id, status: locked.status },
            afterData: { id: updated.id, status: updated.status },
            resultStatus: 'success',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            correlationId: context.correlationId,
          },
          client,
        );
      }
      await this.leads.completeStatusCommand(client, {
        actorUserId: context.actorUserId,
        route,
        idempotencyKey,
        body: response,
        resourceId: updated.id,
      });
      return response;
    });
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
      throw new NotFoundException({
        code: 'BOOKING_LEAD_NOT_FOUND',
        message: 'Booking lead not found',
      });
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
      ? this.assertPublicPlannedDate(dto.preferredMoveInDate)
      : undefined;

    return {
      category,
      gender,
      visitorName: this.sanitizeText(dto.visitorName, 120),
      visitorPhone: this.normalizeIndonesianPhone(dto.visitorPhone),
      visitorMessage: dto.visitorMessage ? this.sanitizeText(dto.visitorMessage, 1000) : undefined,
      visitorUniversity: this.sanitizeText(dto.visitorUniversity, 160),
      preferredMoveInDate,
      visitorEmail: dto.visitorEmail?.trim().toLowerCase() || undefined,
      consent: true,
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

  private assertPublicPlannedDate(value: string): string {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    const [year, month, day] = today.split('-').map(Number);
    const max = new Date(Date.UTC(year, month - 1, day + 62)).toISOString().slice(0, 10);
    if (
      Number.isNaN(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== value ||
      value < today ||
      value > max
    ) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_DATE_OUT_OF_RANGE',
        message: 'preferredMoveInDate must be within the next two months.',
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

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    if (key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be 16 to 128 characters',
      });
    }
    return key;
  }

  private replayStatusCommand(
    claim: import('./types/booking-lead.types').BookingLeadStatusCommandClaim,
    fingerprint: string,
  ): Record<string, unknown> {
    if (claim.requestFingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      });
    }
    if (claim.commandStatus !== 'succeeded' || !claim.responseStatus || !claim.responseBody) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command is still in progress',
      });
    }
    return claim.responseBody;
  }

  private publicResponse(lead: BookingLeadRecord) {
    const digest = createHash('sha256').update(lead.id).digest('hex').slice(0, 12).toUpperCase();
    return {
      reference: `MINAT-${lead.category.toUpperCase()}-${digest}`,
      status: 'new' as const,
      category: lead.category,
      gender: lead.gender,
      createdAt: lead.createdAt,
      message: PUBLIC_SUCCESS_MESSAGE,
    };
  }

  private adminResponse(lead: BookingLeadRecord, roomNumber = lead.roomNumber) {
    return {
      id: lead.id,
      propertyId: lead.propertyId,
      roomId: lead.roomId,
      roomNumber,
      category: lead.category,
      gender: lead.gender,
      buildingCode: lead.buildingCode,
      floorCode: lead.floorCode,
      publicGroupKey: lead.publicGroupKey,
      visitorName: lead.visitorName,
      visitorPhone: lead.visitorPhone,
      visitorAddress: lead.visitorAddress,
      visitorUniversity: lead.visitorUniversity,
      visitorMessage: lead.visitorMessage,
      preferredMoveInDate: lead.preferredMoveInDate,
      activeLeaseStartDate: lead.activeLeaseStartDate,
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
      source: lead.source,
    };
  }

  private publicRequestFingerprint(
    input: ReturnType<BookingLeadService['normalizePublicLeadInput']>,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          category: input.category,
          consent: input.consent,
          gender: input.gender,
          preferredMoveInDate: input.preferredMoveInDate ?? null,
          visitorEmail: input.visitorEmail,
          visitorMessage: input.visitorMessage ?? null,
          visitorName: input.visitorName,
          visitorPhone: input.visitorPhone,
          visitorUniversity: input.visitorUniversity ?? null,
        }),
      )
      .digest('hex');
  }
}
