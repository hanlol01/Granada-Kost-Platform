import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { ResidentAccountService } from './resident-account.service';
import { CommitOnboardingDto } from './dto/commit-onboarding.dto';
import {
  calculateOnboardingCommercial,
  OnboardingCommitmentResponse,
} from './types/onboarding.types';
import { buildContractSchedule } from '../billing/helpers/contract-schedule.helper';

type RoomRow = {
  id: string;
  property_id: string;
  room_number: string;
  category: 'rukost' | 'apartkost';
  room_category: 'rukost' | 'apartkost';
  gender_policy: string;
  room_status: string;
  building_code: string;
  building_property_id: string;
  building_category: 'rukost' | 'apartkost';
  building_gender_policy: 'male' | 'female';
  floor_code: string;
  kost_type_id: string;
  kost_type_name: string;
  kost_type_property_id: string;
  kost_type_category: 'rukost' | 'apartkost';
  kost_type_status: 'active' | 'inactive';
  kost_type_deleted_at: string | null;
  monthly_price: number;
  yearly_price: number;
  security_deposit_amount: number;
};
type OnboardingHoldRow = {
  id: string;
  property_id: string;
  booking_lead_id: string;
  room_id: string;
  is_current: boolean;
};
type ExistingResidentRow = {
  id: string;
  property_id: string;
  gender: 'male' | 'female';
  full_name: string;
};
type LeadRow = {
  id: string;
  room_id: string | null;
  property_id: string;
  status: string;
  category: string;
  gender: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string | null;
};
type CommandReplayRow = {
  request_fingerprint: string;
  command_status: string;
  response_body: { data: OnboardingCommitmentResponse } | null;
};

@Injectable()
export class OnboardingService {
  private readonly route = '/residents/onboard';
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly accounts: ResidentAccountService,
    private readonly audit: AuditRepository,
  ) {}

  async commit(
    actor: UserAccessContext,
    dto: CommitOnboardingDto,
    key: string | undefined,
    context: RequestAuditContext,
  ): Promise<OnboardingCommitmentResponse> {
    const idempotencyKey = key?.trim();
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key is required',
      });
    if (dto.visitor_name.trim().length === 0 || dto.accepted_terms_version.trim().length === 0)
      throw new BadRequestException({
        code: 'ONBOARDING_INPUT_INVALID',
        message: 'Required onboarding fields are missing',
      });
    await this.properties.assertCanReadProperty(actor, dto.property_id);
    const fingerprint = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    return this.database.transaction(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text, 0))`,
        [dto.property_id],
      );
      const claim = await client.query<{ id: string }>(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status,correlation_id) VALUES($1,$2,$3,$4,$5,'pending',$6) ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING id`,
        [
          dto.property_id,
          actor.id,
          this.route,
          idempotencyKey,
          fingerprint,
          context.correlationId ?? null,
        ],
      );
      if (!claim.rowCount) return this.replay(client, actor.id, idempotencyKey, fingerprint);
      const property = await client.query(`SELECT id FROM properties WHERE id=$1 FOR UPDATE`, [
        dto.property_id,
      ]);
      if (!property.rowCount)
        throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'Property not found' });
      const lead = dto.booking_lead_id
        ? (
            await client.query<LeadRow>(
              `SELECT id,room_id,property_id,status,category,gender,visitor_name,visitor_phone,visitor_email FROM booking_leads WHERE id=$1 AND property_id=$2 FOR UPDATE`,
              [dto.booking_lead_id, dto.property_id],
            )
          ).rows[0]
        : null;
      if (dto.booking_lead_id && !lead)
        throw new ConflictException({
          code: 'BOOKING_LEAD_SCOPE_STALE',
          message: 'Booking lead is unavailable',
        });
      if (
        lead &&
        ![
          'new',
          'contacted',
          'visit_scheduled',
          'negotiating',
          'awaiting_dp',
          'onboarding',
        ].includes(lead.status)
      )
        throw new ConflictException({
          code: 'BOOKING_LEAD_NOT_ELIGIBLE',
          message: 'Booking lead is not eligible for onboarding',
        });
      const roomId = dto.room_id ?? lead?.room_id;
      if (!roomId)
        throw new BadRequestException({
          code: 'ROOM_REQUIRED',
          message: 'A room is required before onboarding commitment',
        });
      if (lead?.room_id && dto.room_id && lead.room_id !== dto.room_id)
        throw new ConflictException({
          code: 'ROOM_COMPATIBILITY_MISMATCH',
          message: 'Onboarding room does not match the booking lead selection',
        });
      const holdResult = await client.query<OnboardingHoldRow>(
        `SELECT id,property_id,booking_lead_id,room_id,
                (hold_status='active' AND expires_at>now()) AS is_current
         FROM booking_lead_holds
         WHERE property_id=$1
           AND hold_status='active'
           AND (booking_lead_id=$2 OR room_id=$3)
         ORDER BY id
         FOR UPDATE`,
        [dto.property_id, lead?.id ?? null, roomId],
      );
      if (holdResult.rows.length > 1)
        throw new ConflictException({
          code: 'ONBOARDING_HOLD_AMBIGUOUS',
          message: 'Onboarding hold authority is ambiguous',
        });
      const hold = holdResult.rows[0];
      if (
        hold &&
        (hold.property_id !== dto.property_id ||
          hold.booking_lead_id !== lead?.id ||
          hold.room_id !== roomId)
      )
        throw new ConflictException({
          code: 'ONBOARDING_HOLD_MISMATCH',
          message: 'Onboarding hold authority requires reconciliation',
        });
      let existingResident: ExistingResidentRow | null = null;
      if (dto.resident_id) {
        const existingResidentResult = await client.query<ExistingResidentRow>(
          `SELECT id,property_id,gender,full_name FROM residents WHERE id=$1 AND property_id=$2 FOR UPDATE`,
          [dto.resident_id, dto.property_id],
        );
        existingResident = existingResidentResult.rows[0] ?? null;
        if (!existingResident)
          throw new ConflictException({
            code: 'RESIDENT_SCOPE_STALE',
            message: 'Resident is unavailable for onboarding',
          });
        if (existingResident.gender !== dto.gender)
          throw new ConflictException({
            code: 'RESIDENT_COMPATIBILITY_MISMATCH',
            message: 'Resident does not match onboarding gender',
          });
      }
      const roomResult = await client.query<RoomRow>(
        `SELECT r.id,r.property_id,r.number AS room_number,kt.category,
                r.category AS room_category,r.gender_policy,r.room_status,
                rb.building_code,rb.property_id AS building_property_id,
                rb.category AS building_category,rb.gender_policy AS building_gender_policy,
                r.floor_code,kt.id AS kost_type_id,kt.name AS kost_type_name,
                kt.property_id AS kost_type_property_id,kt.category AS kost_type_category,
                kt.status AS kost_type_status,kt.deleted_at AS kost_type_deleted_at,
                COALESCE(kcv.monthly_price,kt.monthly_price,0)::bigint AS monthly_price,
                COALESCE(kcv.annual_price,kt.annual_price,0)::bigint AS yearly_price,
                COALESCE(kcv.security_deposit_amount,kt.security_deposit_amount,0)::bigint AS security_deposit_amount
         FROM rooms r
         JOIN room_buildings rb ON rb.id=r.building_id
         JOIN kost_types kt ON kt.id=r.kost_type_id
         LEFT JOIN LATERAL (
           SELECT monthly_price,annual_price,security_deposit_amount
           FROM kost_type_commercial_versions
           WHERE property_id=$2 AND kost_type_id=kt.id AND effective_date<=CURRENT_DATE
           ORDER BY effective_date DESC,id DESC
           LIMIT 1
         ) kcv ON true
         WHERE r.id=$1 AND r.property_id=$2
         FOR UPDATE OF r,rb,kt`,
        [roomId, dto.property_id],
      );
      const room = roomResult.rows[0];
      if (!room)
        throw new ConflictException({
          code: 'ROOM_SCOPE_STALE',
          message: 'Room is unavailable for onboarding',
        });
      if (
        room.property_id !== dto.property_id ||
        room.building_property_id !== dto.property_id ||
        room.kost_type_property_id !== dto.property_id ||
        room.category !== room.room_category ||
        room.category !== room.building_category ||
        room.category !== room.kost_type_category ||
        room.building_gender_policy !== dto.gender ||
        (room.gender_policy !== 'mixed' && room.gender_policy !== dto.gender) ||
        room.kost_type_status !== 'active' ||
        room.kost_type_deleted_at !== null
      )
        throw new ConflictException({
          code: 'ROOM_COMMERCIAL_AUTHORITY_MISMATCH',
          message: 'Room commercial authority requires reconciliation',
        });
      if (room.room_status !== 'vacant' && room.room_status !== 'reserved')
        throw new ConflictException({
          code: 'ROOM_NOT_AVAILABLE',
          message: 'Room is not available for onboarding',
        });
      const activeOccupancies = await client.query<{ id: string }>(
        `SELECT id
         FROM occupancies
         WHERE property_id=$1
           AND occupancy_status='active'
           AND (room_id=$2 OR ($3::uuid IS NOT NULL AND resident_id=$3))
         ORDER BY id
         FOR UPDATE`,
        [dto.property_id, room.id, dto.resident_id ?? null],
      );
      const activeLeases = await client.query<{ id: string }>(
        `SELECT id
         FROM leases
         WHERE property_id=$1
           AND lease_status IN ('active','awaiting_activation')
           AND (room_id=$2 OR ($3::uuid IS NOT NULL AND resident_id=$3))
         ORDER BY id
         FOR UPDATE`,
        [dto.property_id, room.id, dto.resident_id ?? null],
      );
      if (activeOccupancies.rows.length > 1 || activeLeases.rows.length > 1)
        throw new ConflictException({
          code: 'ROOM_LIFECYCLE_AMBIGUOUS',
          message: 'Room lifecycle authority requires reconciliation',
        });
      if (activeOccupancies.rows.length === 1 || activeLeases.rows.length === 1)
        throw new ConflictException({
          code: 'ROOM_LIFECYCLE_CONFLICT',
          message: 'Room has an active lifecycle record and cannot enter onboarding',
        });
      if (
        lead &&
        (lead.category !== room.category ||
          (lead.gender !== room.gender_policy && room.gender_policy !== 'mixed'))
      )
        throw new ConflictException({
          code: 'ROOM_COMPATIBILITY_MISMATCH',
          message: 'Room does not match lead compatibility',
        });
      if (room.gender_policy !== 'mixed' && dto.gender !== room.gender_policy)
        throw new ConflictException({
          code: 'ROOM_COMPATIBILITY_MISMATCH',
          message: 'Room does not match onboarding gender',
        });
      if (room.room_status === 'reserved' && (!hold || !hold.is_current))
        throw new ConflictException({
          code: 'ROOM_RESERVATION_UNVERIFIED',
          message: 'Reserved room requires an active compatible hold',
        });
      const identityPhone = lead?.visitor_phone ?? dto.visitor_phone ?? null;
      const identityEmail = lead?.visitor_email ?? dto.visitor_email ?? null;
      if (!dto.resident_id && !identityPhone && !identityEmail)
        throw new BadRequestException({
          code: 'RESIDENT_IDENTITY_REQUIRED',
          message: 'A resident identity or contact-backed lead is required',
        });
      const residentId =
        dto.resident_id ??
        (
          await client.query<{ id: string }>(
            `INSERT INTO residents(property_id,full_name,phone,email,gender,resident_status,created_by_user_id) VALUES($1,$2,$3,$4,$5,'pending_activation',$6) RETURNING id`,
            [
              dto.property_id,
              dto.visitor_name.trim(),
              identityPhone,
              identityEmail,
              dto.gender,
              actor.id,
            ],
          )
        ).rows[0].id;
      const account = await this.accounts.provisionInTransaction(
        client,
        actor,
        residentId,
        dto.property_id,
        context,
      );
      let commercial: ReturnType<typeof calculateOnboardingCommercial>;
      try {
        commercial = calculateOnboardingCommercial(
          Number(room.monthly_price),
          Number(room.yearly_price),
          dto.billing_cycle,
          dto.term_months,
        );
      } catch {
        throw new ConflictException({
          code: 'ONBOARDING_COMMERCIAL_INVALID',
          message: 'Commercial authority is invalid for onboarding',
        });
      }
      const { contractRent, dpRequired, depositRequired } = commercial;
      if (
        Number(room.security_deposit_amount) !== 0 &&
        Number(room.security_deposit_amount) !== depositRequired
      )
        throw new ConflictException({
          code: 'ONBOARDING_COMMERCIAL_RECONCILIATION_REQUIRED',
          message: 'Category deposit authority does not match the one-month policy',
        });
      if (
        dto.dp_verified_amount < dpRequired ||
        dto.security_deposit_funded_amount < depositRequired
      )
        throw new ConflictException({
          code: 'ONBOARDING_FINANCIAL_OBLIGATION_UNMET',
          message: 'DP and security deposit obligations must be satisfied before commitment',
        });
      const endDate = new Date(dto.start_date);
      endDate.setUTCMonth(endDate.getUTCMonth() + dto.term_months);
      endDate.setUTCDate(endDate.getUTCDate() - 1);
      const commitment = await client.query<{ id: string }>(
        `INSERT INTO onboarding_commitments(property_id,booking_lead_id,hold_id,resident_id,room_id,category,gender,status,term_months,billing_cycle,payment_plan_type,start_date,end_date,contract_rent_amount,dp_required_amount,dp_verified_amount,security_deposit_required_amount,security_deposit_funded_amount,accepted_terms_version,notes,created_by_user_id,committed_at) VALUES($1,$2,$3,$4,$5,$6,$7,'committed',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now()) RETURNING id`,
        [
          dto.property_id,
          lead?.id ?? null,
          hold?.id ?? null,
          residentId,
          room.id,
          room.category,
          dto.gender,
          dto.term_months,
          dto.billing_cycle,
          dto.payment_plan_type,
          dto.start_date,
          endDate.toISOString().slice(0, 10),
          contractRent,
          dpRequired,
          dto.dp_verified_amount,
          depositRequired,
          dto.security_deposit_funded_amount,
          dto.accepted_terms_version,
          dto.notes ?? null,
          actor.id,
        ],
      );
      const lease = await client.query<{ id: string }>(
        `INSERT INTO leases(property_id,lease_code,resident_id,room_id,occupancy_id,kost_type_id,lease_status,start_date,end_date,billing_cycle,billing_anchor_day,next_billing_date,snapshot_monthly_price,snapshot_yearly_price,snapshot_deposit_amount,snapshot_room_number,snapshot_kost_type_name,booking_lead_id,onboarding_commitment_id,term_months,payment_plan_type,contract_rent_amount,dp_required_amount,security_deposit_required_amount,signed_at,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,NULL,$5,'awaiting_activation',$6,$7,$8,25,$6::date,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),$21,$21) RETURNING id`,
        [
          dto.property_id,
          `ONB-${Date.now()}`,
          residentId,
          room.id,
          room.kost_type_id,
          dto.start_date,
          endDate.toISOString().slice(0, 10),
          dto.billing_cycle,
          room.monthly_price,
          room.yearly_price,
          depositRequired,
          room.room_number,
          room.kost_type_name,
          lead?.id ?? null,
          commitment.rows[0].id,
          dto.term_months,
          dto.payment_plan_type,
          contractRent,
          dpRequired,
          depositRequired,
          actor.id,
        ],
      );
      await client.query(
        `UPDATE onboarding_commitments SET lease_id=$2,updated_at=now() WHERE id=$1`,
        [commitment.rows[0].id, lease.rows[0].id],
      );
      await client.query(
        `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
         VALUES($1,$2,'created',$3,$4::date,$5::jsonb)`,
        [
          dto.property_id,
          lease.rows[0].id,
          actor.id,
          dto.start_date,
          JSON.stringify({ source: 'resident_onboarding', lease_status: 'awaiting_activation' }),
        ],
      );
      const schedule = buildContractSchedule({
        startDate: dto.start_date,
        termMonths: dto.term_months,
        paymentPlanType: dto.payment_plan_type,
        contractRentAmount: contractRent,
      });
      for (const item of schedule) {
        const installmentId = randomUUID();
        await client.query(
          `INSERT INTO lease_installments(id,property_id,lease_id,sequence_number,coverage_start_date,coverage_end_date,due_date,scheduled_amount,installment_status)
           VALUES($1,$2,$3,$4,$5::date,$6::date,$7::date,$8,$9)`,
          [
            installmentId,
            dto.property_id,
            lease.rows[0].id,
            item.sequenceNumber,
            item.coverageStartDate,
            item.coverageEndDate,
            item.dueDate,
            item.scheduledAmount,
            item.sequenceNumber === 1 ? 'issued' : 'scheduled',
          ],
        );
        const invoiceId = randomUUID();
        await client.query(
          `INSERT INTO invoices(
             id,property_id,resident_id,room_id,occupancy_id,billing_period_id,lease_id,installment_id,
             invoice_code,invoice_status,subtotal_amount,total_amount,due_date,issued_at,
             snapshot_period_key,snapshot_period_start_date,snapshot_period_end_date,
             snapshot_room_number,snapshot_resident_name,snapshot_monthly_price,
             cycle_start_date,cycle_end_date,snapshot_billing_cycle,snapshot_rent_amount,
             generation_source,invoice_purpose,authority_source,snapshot_building_code,
             snapshot_category_name,snapshot_contract_rent_amount,snapshot_payment_plan_type,
             created_by_user_id
           ) VALUES(
             $1,$2,$3,$4,NULL,NULL,$5,$6,$7,$8,$9,$9,$10::date,
             CASE WHEN $8='issued' THEN now() ELSE NULL END,$11,$12::date,$13::date,$14,$15,
             $16,$12::date,$13::date,$17,$9,'auto','rent','contract_schedule',$18,$19,$20,$21,$22
           )`,
          [
            invoiceId,
            dto.property_id,
            residentId,
            room.id,
            lease.rows[0].id,
            installmentId,
            `RENT-${lease.rows[0].id.slice(0, 8).toUpperCase()}-${String(item.sequenceNumber).padStart(2, '0')}`,
            item.sequenceNumber === 1 ? 'issued' : 'draft',
            item.scheduledAmount,
            item.dueDate,
            `LEASE-${lease.rows[0].id}-${item.sequenceNumber}`,
            item.coverageStartDate,
            item.coverageEndDate,
            room.room_number,
            existingResident?.full_name ?? dto.visitor_name.trim(),
            room.monthly_price,
            dto.billing_cycle,
            room.building_code,
            room.kost_type_name,
            contractRent,
            dto.payment_plan_type,
            actor.id,
          ],
        );
        await client.query(
          `INSERT INTO invoice_line_items(invoice_id,line_type,description,quantity,unit_amount,total_amount,sort_order,metadata)
           VALUES($1,'rent',$2,1,$3,$3,0,$4::jsonb)`,
          [
            invoiceId,
            `Sewa ${item.coverageStartDate} s.d. ${item.coverageEndDate}`,
            item.scheduledAmount,
            JSON.stringify({ lease_id: lease.rows[0].id, installment_id: installmentId }),
          ],
        );
        await client.query(
          `UPDATE lease_installments SET invoice_id=$2 WHERE id=$1 AND lease_id=$3`,
          [installmentId, invoiceId, lease.rows[0].id],
        );
      }
      if (hold)
        await client.query(
          `UPDATE booking_lead_holds SET onboarding_commitment_id=$2,release_reason='promoted_to_onboarding',updated_at=now() WHERE id=$1`,
          [hold.id, commitment.rows[0].id],
        );
      if (lead)
        await client.query(
          `UPDATE booking_leads SET status='onboarding',resident_id=$2,onboarding_commitment_id=$3,updated_at=now() WHERE id=$1`,
          [lead.id, residentId, commitment.rows[0].id],
        );
      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId: dto.property_id,
          action: 'resident.onboarding_commit',
          resourceType: 'onboarding_commitment',
          resourceId: commitment.rows[0].id,
          afterData: {
            status: 'committed',
            lease_status: 'awaiting_activation',
            room_number: room.room_number,
          },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await client.query(
        `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,correlation_id,actor_user_id,payload) VALUES($1,$2,'resident.onboarding_committed','onboarding_commitment',$3,$4,$5,$6::jsonb)`,
        [
          dto.property_id,
          `resident.onboarding_committed:${commitment.rows[0].id}`,
          commitment.rows[0].id,
          context.correlationId ?? null,
          actor.id,
          JSON.stringify({
            commitment_id: commitment.rows[0].id,
            lease_id: lease.rows[0].id,
            room_number: room.room_number,
          }),
        ],
      );
      const response: OnboardingCommitmentResponse = {
        commitmentId: commitment.rows[0].id,
        status: 'committed',
        leaseId: lease.rows[0].id,
        leaseStatus: 'awaiting_activation',
        roomNumber: room.room_number,
        category: room.category,
        startDate: dto.start_date,
        endDate: endDate.toISOString().slice(0, 10),
        termMonths: dto.term_months,
        billingCycle: dto.billing_cycle,
        paymentPlanType: dto.payment_plan_type,
        contractRentAmount: contractRent,
        dpRequiredAmount: dpRequired,
        securityDepositRequiredAmount: depositRequired,
        temporaryPassword: account.temporaryPassword,
      };
      await client.query(
        `UPDATE idempotency_commands SET command_status='succeeded',response_status=201,response_body=$4::jsonb,resource_type='onboarding_commitment',resource_id=$5,completed_at=now() WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3`,
        [
          actor.id,
          this.route,
          idempotencyKey,
          JSON.stringify({ data: { ...response, temporaryPassword: null } }),
          commitment.rows[0].id,
        ],
      );
      return response;
    });
  }
  private async replay(
    client: PoolClient,
    actorId: string,
    key: string,
    fingerprint: string,
  ): Promise<OnboardingCommitmentResponse> {
    const row = await client.query<CommandReplayRow>(
      `SELECT request_fingerprint,command_status,response_body FROM idempotency_commands WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
      [actorId, this.route, key],
    );
    if (!row.rows[0] || row.rows[0].request_fingerprint !== fingerprint)
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key was already used for another command',
      });
    if (row.rows[0].command_status !== 'succeeded')
      throw new ConflictException({
        code: 'IDEMPOTENCY_COMMAND_IN_PROGRESS',
        message: 'Onboarding is still in progress',
      });
    return { ...row.rows[0].response_body!.data, temporaryPassword: null };
  }
}
