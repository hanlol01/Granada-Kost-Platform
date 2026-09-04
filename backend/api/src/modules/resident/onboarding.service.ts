import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'crypto';
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
import { W06BillingService } from '../billing/services/w06-billing.service';
import { ContractScheduleIssuanceService } from '../billing/services/contract-schedule-issuance.service';
import { AdminPaymentVerificationPolicyService } from '../billing/services/admin-payment-verification-policy.service';

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
  monthly_price: number | string;
  yearly_price: number | string;
  security_deposit_amount: number | string;
};
type OnboardingHoldRow = {
  id: string;
  property_id: string;
  booking_lead_id: string;
  room_id: string;
  is_current: boolean;
};
type LeadPaymentCommitmentRow = {
  id: string;
  property_id: string;
  booking_lead_id: string;
  hold_id: string;
  room_id: string;
  payment_type: 'booking_fee' | 'down_payment' | 'full_settlement';
  receipt_code: string;
  transaction_code: string | null;
  rent_credit_amount: string | number;
  security_deposit_amount: string | number;
  payment_method: 'cash' | 'bank_transfer';
  verification_status: 'verified' | 'pending_confirmation';
  payment_note: string | null;
  payment_evidence_file_ids: string[];
  paid_at: Date;
  start_date: string;
  term_months: string | number;
  end_date: string;
  billing_cycle: 'monthly' | 'yearly';
  payment_plan_type: 'monthly_installments' | 'two_month_installments' | 'annual_full';
  materialized_onboarding_commitment_id: string | null;
  created_at: Date;
};
type ExistingResidentRow = {
  id: string;
  property_id: string;
  gender: 'male' | 'female';
  full_name: string;
};
type ResidentIdentityRow = {
  id: string;
  email: string | null;
  phone: string | null;
  ktp_number: string | null;
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

const MINIMUM_BOOKING_FEE = 1_000_000;

@Injectable()
export class OnboardingService {
  private readonly route = '/residents/onboard';
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly accounts: ResidentAccountService,
    private readonly audit: AuditRepository,
    private readonly w06Billing: W06BillingService,
    private readonly contractScheduleIssuance: ContractScheduleIssuanceService,
    @Optional()
    private readonly paymentVerificationPolicy?: AdminPaymentVerificationPolicyService,
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
    const stagedPaymentEntries = dto.payment_entries ?? [];
    if (dto.booking_lead_id && stagedPaymentEntries.length > 0)
      throw new BadRequestException({
        code: 'BOOKING_LEAD_STAGED_PAYMENTS_UNSUPPORTED',
        message: 'Pembayaran bertahap hanya tersedia untuk tambah penyewaan langsung',
      });
    if (
      stagedPaymentEntries.length > 0 &&
      (dto.dp_verified_amount !== 0 ||
        dto.security_deposit_funded_amount !== 0 ||
        (dto.booking_fee_paid_amount ?? 0) !== 0)
    )
      throw new BadRequestException({
        code: 'ONBOARDING_PAYMENT_INPUT_AMBIGUOUS',
        message: 'Gunakan daftar pembayaran bertahap tanpa mencampur nominal pembayaran lama',
      });
    const bookingFeeEntries = stagedPaymentEntries.filter(
      (entry) => entry.purpose === 'booking_fee',
    );
    if (bookingFeeEntries.length > 1)
      throw new BadRequestException({
        code: 'ONBOARDING_BOOKING_FEE_DUPLICATE',
        message: 'Booking fee hanya boleh dicatat satu kali',
      });
    const bookingFeeAmount =
      stagedPaymentEntries.length > 0
        ? bookingFeeEntries.reduce((total, entry) => total + entry.amount, 0)
        : (dto.booking_fee_paid_amount ?? 0);
    if (
      !Number.isSafeInteger(bookingFeeAmount) ||
      bookingFeeAmount < 0 ||
      (bookingFeeAmount > 0 && bookingFeeAmount < MINIMUM_BOOKING_FEE)
    )
      throw new BadRequestException({
        code: 'BOOKING_FEE_MINIMUM_NOT_MET',
        message: 'Booking fee must be zero or at least Rp1.000.000',
      });
    await this.properties.assertCanReadProperty(actor, dto.property_id);
    const fingerprint = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    try {
      return await this.database.transaction(async (client) => {
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
          throw new NotFoundException({
            code: 'PROPERTY_NOT_FOUND',
            message: 'Property not found',
          });
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
                (hold_status='committed' OR (hold_status='active' AND expires_at>now())) AS is_current
         FROM booking_lead_holds
         WHERE property_id=$1
           AND hold_status IN ('active','committed')
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
        let leadPaymentCommitment: LeadPaymentCommitmentRow | null = null;
        if (lead) {
          if (lead.status !== 'onboarding')
            throw new ConflictException({
              code: 'BOOKING_LEAD_COMPLETION_REQUIRED',
              message: 'Complete booking lead payment data before onboarding',
            });
          if (!hold?.is_current)
            throw new ConflictException({
              code: 'BOOKING_LEAD_HOLD_REQUIRED',
              message: 'A current room hold is required before onboarding',
            });
          const paymentCommitmentResult = await client.query<LeadPaymentCommitmentRow>(
            `SELECT id,property_id,booking_lead_id,hold_id,room_id,payment_type,receipt_code,transaction_code,
                    rent_credit_amount::bigint AS rent_credit_amount,
                    security_deposit_amount::bigint AS security_deposit_amount,
                    payment_method,verification_status,payment_note,payment_evidence_file_ids,
                    start_date::text,term_months,end_date::text,billing_cycle,payment_plan_type,
                    materialized_onboarding_commitment_id,paid_at,created_at
             FROM booking_lead_payment_commitments
             WHERE booking_lead_id=$1 AND property_id=$2
             FOR UPDATE`,
            [lead.id, dto.property_id],
          );
          leadPaymentCommitment = paymentCommitmentResult.rows[0] ?? null;
          if (
            !leadPaymentCommitment ||
            leadPaymentCommitment.materialized_onboarding_commitment_id ||
            leadPaymentCommitment.hold_id !== hold.id ||
            leadPaymentCommitment.room_id !== roomId
          )
            throw new ConflictException({
              code: 'BOOKING_LEAD_PAYMENT_COMMITMENT_REQUIRED',
              message: 'Booking lead payment commitment is unavailable or already materialized',
            });
          // The lead payment commitment is immutable evidence of money received.
          // Before onboarding is committed, the final tenancy period can still be
          // adjusted. The recalculated commercial snapshot and the total-credit
          // guard below remain the final authority.
        }
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
                kcv.monthly_price::bigint AS monthly_price,
                kcv.annual_contract_value::bigint AS yearly_price,
                (kcv.monthly_price * kcv.security_deposit_months)::bigint AS security_deposit_amount
         FROM rooms r
         JOIN room_buildings rb ON rb.id=r.building_id
         JOIN kost_types kt ON kt.id=r.kost_type_id
         JOIN LATERAL (
           SELECT monthly_price,annual_contract_value,security_deposit_months
           FROM kost_type_commercial_versions
           WHERE kost_type_id=kt.id
             AND (effective_date<=$3::date OR $4::boolean)
           ORDER BY
             CASE WHEN effective_date<=$3::date THEN 0 ELSE 1 END,
             CASE WHEN effective_date<=$3::date THEN effective_date END DESC,
             effective_date ASC,
             id ASC
           LIMIT 1
         ) kcv ON true
         WHERE r.id=$1 AND r.property_id=$2
         FOR UPDATE OF r,rb,kt`,
          [roomId, dto.property_id, dto.start_date, leadPaymentCommitment !== null],
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
        const identityPhone = dto.visitor_phone?.trim() || lead?.visitor_phone?.trim() || null;
        const identityEmail = dto.visitor_email?.trim() || lead?.visitor_email?.trim() || null;
        if (!dto.resident_id && !identityPhone)
          throw new BadRequestException({
            code: 'RESIDENT_PHONE_REQUIRED',
            message: 'A resident WhatsApp phone number is required',
          });
        if (!dto.resident_id)
          await this.assertNewResidentIdentityAvailable(client, dto.property_id, {
            email: identityEmail,
            phone: identityPhone,
            ktpNumber: dto.ktp_number ?? null,
          });
        if (dto.ktp_file_id) {
          const ktpDocument = await client.query<{ id: string }>(
            `SELECT id FROM files
           WHERE id=$1 AND property_id=$2 AND uploader_user_id=$3
             AND file_purpose='ktp' AND is_deleted=false
             AND mime_type IN('image/jpeg','image/png','application/pdf')
           FOR KEY SHARE`,
            [dto.ktp_file_id, dto.property_id, actor.id],
          );
          if (ktpDocument.rowCount !== 1)
            throw new BadRequestException({
              code: 'RESIDENT_KTP_DOCUMENT_INVALID',
              message: 'KTP document is unavailable in the active property',
            });
        }
        if (dto.profile_photo_file_id) {
          const profilePhoto = await client.query<{ id: string }>(
            `SELECT id FROM files
           WHERE id=$1 AND property_id=$2 AND uploader_user_id=$3
             AND file_purpose='profile_photo' AND is_deleted=false
             AND mime_type IN('image/jpeg','image/png','image/webp')
           FOR KEY SHARE`,
            [dto.profile_photo_file_id, dto.property_id, actor.id],
          );
          if (profilePhoto.rowCount !== 1)
            throw new BadRequestException({
              code: 'RESIDENT_PROFILE_PHOTO_INVALID',
              message: 'Profile photo is unavailable in the active property',
            });
        }
        const residentId =
          dto.resident_id ??
          (
            await client.query<{ id: string }>(
              `INSERT INTO residents(
             property_id,full_name,phone,email,gender,resident_status,place_of_birth,date_of_birth,address,
             university,cohort,faculty,major,instagram,emergency_phone,parent_name,parent_phone,ktp_number,ktp_file_id,profile_photo_file_id,created_by_user_id
           ) VALUES(
             $1,$2,$3,$4,$5,'pending_activation',$6,$7::date,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
           ) RETURNING id`,
              [
                dto.property_id,
                dto.visitor_name.trim(),
                identityPhone,
                identityEmail,
                dto.gender,
                dto.place_of_birth ?? null,
                dto.date_of_birth ?? null,
                dto.address ?? null,
                dto.university ?? null,
                dto.cohort ?? null,
                dto.faculty ?? null,
                dto.major ?? null,
                dto.instagram ?? null,
                dto.emergency_phone ?? null,
                dto.parent_name ?? null,
                dto.parent_phone ?? null,
                dto.ktp_number ?? null,
                dto.ktp_file_id ?? null,
                dto.profile_photo_file_id ?? null,
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
        const monthlyPrice = Number(room.monthly_price);
        const yearlyPrice = Number(room.yearly_price);
        let commercial: ReturnType<typeof calculateOnboardingCommercial>;
        try {
          commercial = calculateOnboardingCommercial(
            monthlyPrice,
            yearlyPrice,
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
        const leadRentCredit = leadPaymentCommitment
          ? Number(leadPaymentCommitment.rent_credit_amount)
          : null;
        const leadSecurityDeposit = leadPaymentCommitment
          ? Number(leadPaymentCommitment.security_deposit_amount)
          : null;
        const leadBookingFee =
          leadPaymentCommitment?.payment_type === 'booking_fee' ? (leadRentCredit ?? 0) : 0;
        const stagedDirectOnboarding = !leadPaymentCommitment && stagedPaymentEntries.length > 0;
        const stagedRentAmount = stagedPaymentEntries.reduce(
          (total, entry) => total + (entry.purpose === 'rent' ? entry.amount : 0),
          0,
        );
        const stagedSecurityDepositAmount = stagedPaymentEntries.reduce(
          (total, entry) => total + (entry.purpose === 'security_deposit' ? entry.amount : 0),
          0,
        );
        const effectiveDpAmount = leadPaymentCommitment
          ? leadPaymentCommitment.payment_type === 'booking_fee'
            ? dto.dp_verified_amount
            : (leadRentCredit ?? 0)
          : stagedDirectOnboarding
            ? stagedRentAmount
            : dto.dp_verified_amount;
        const isBookingFeeLead = leadPaymentCommitment?.payment_type === 'booking_fee';
        const recordsNewPayment = !leadPaymentCommitment || isBookingFeeLead;
        const effectiveSecurityDeposit = leadPaymentCommitment
          ? isBookingFeeLead
            ? dto.security_deposit_funded_amount
            : (leadSecurityDeposit ?? 0)
          : stagedDirectOnboarding
            ? stagedSecurityDepositAmount
            : dto.security_deposit_funded_amount;
        if (
          leadPaymentCommitment &&
          (bookingFeeAmount !== leadBookingFee ||
            (!isBookingFeeLead && dto.dp_verified_amount !== leadRentCredit) ||
            (!isBookingFeeLead &&
              (dto.security_deposit_funded_amount !== leadSecurityDeposit ||
                dto.payment_method !== leadPaymentCommitment.payment_method)))
        )
          throw new ConflictException({
            code: 'BOOKING_LEAD_PAYMENT_COMMITMENT_SCOPE_STALE',
            message: 'Initial payment values must match the completed booking lead commitment',
          });
        // A direct onboarding may itself record a Booking Fee. For a lead-based
        // onboarding, the immutable lead commitment owns that value instead.
        // Do not silently drop either credit before W06 allocates it to rent.
        const recordedBookingFeeAmount = leadPaymentCommitment ? leadBookingFee : bookingFeeAmount;
        const initialRentCredit = effectiveDpAmount + recordedBookingFeeAmount;
        const normalVerificationDecision = {
          status:
            dto.payment_method === 'cash'
              ? ('verified' as const)
              : ('pending_confirmation' as const),
          automaticallyVerified: false,
          policy: { requiresActualPaymentDate: false },
        };
        const verificationDecision = dto.booking_lead_id
          ? normalVerificationDecision
          : (this.paymentVerificationPolicy?.decide(dto.property_id, dto.payment_method) ??
            normalVerificationDecision);
        const currentPaymentStatus = verificationDecision.status;
        if (
          !stagedDirectOnboarding &&
          verificationDecision.policy.requiresActualPaymentDate &&
          recordsNewPayment &&
          !dto.payment_paid_at
        )
          throw new BadRequestException({
            code: 'PAYMENT_PAID_AT_REQUIRED',
            message: 'Actual payment date is required while historical-entry mode is active',
          });
        const rentPayments = [] as Array<{
          classification: 'booking_fee' | 'down_payment' | 'installment' | 'full_settlement';
          amount: number;
          method: 'cash' | 'bank_transfer';
          status: 'verified' | 'pending_confirmation';
          evidenceFileIds: string[];
          paymentNote?: string;
          paidAt?: string | Date;
          transactionCode?: string | null;
        }>;
        let securityDepositPayment:
          | {
              amount: number;
              method: 'cash' | 'bank_transfer';
              status: 'verified' | 'pending_confirmation';
              evidenceFileIds: string[];
              paymentNote?: string;
              paidAt?: string | Date;
            }
          | undefined;
        if (stagedDirectOnboarding) {
          const securityDepositEntries = stagedPaymentEntries.filter(
            (entry) => entry.purpose === 'security_deposit',
          );
          if (securityDepositEntries.length > 1)
            throw new BadRequestException({
              code: 'ONBOARDING_SECURITY_DEPOSIT_DUPLICATE',
              message: 'Security deposit hanya boleh dicatat satu kali',
            });
          let runningRentCredit = 0;
          let rentPaymentCount = 0;
          let rentPaymentSeen = false;
          let previousPaidAt = '';
          for (const entry of stagedPaymentEntries) {
            const paidAtDate = entry.paid_at.slice(0, 10);
            if (previousPaidAt && paidAtDate < previousPaidAt)
              throw new BadRequestException({
                code: 'ONBOARDING_PAYMENT_DATE_ORDER_INVALID',
                message: 'Tanggal pembayaran harus berurutan dari yang paling lama',
              });
            previousPaidAt = paidAtDate;
            if (entry.purpose === 'booking_fee' && rentPaymentSeen)
              throw new BadRequestException({
                code: 'ONBOARDING_BOOKING_FEE_ORDER_INVALID',
                message: 'Booking fee harus dicatat sebelum pembayaran sewa',
              });
            const decision = this.paymentVerificationPolicy?.decide(
              dto.property_id,
              entry.method,
            ) ?? {
              status:
                entry.method === 'cash' ? ('verified' as const) : ('pending_confirmation' as const),
              automaticallyVerified: false,
              policy: { requiresActualPaymentDate: false },
            };
            const evidenceFileIds = entry.evidence_file_ids ?? [];
            if (entry.purpose === 'security_deposit') {
              securityDepositPayment = {
                amount: entry.amount,
                method: entry.method,
                status: decision.status,
                evidenceFileIds,
                paymentNote: entry.note,
                paidAt: entry.paid_at,
              };
              continue;
            }
            if (entry.purpose === 'booking_fee') {
              runningRentCredit += entry.amount;
              rentPayments.push({
                classification: 'booking_fee',
                amount: entry.amount,
                method: entry.method,
                status: decision.status,
                evidenceFileIds,
                paymentNote: entry.note,
                paidAt: entry.paid_at,
              });
              continue;
            }
            rentPaymentSeen = true;
            const nextRentCredit = runningRentCredit + entry.amount;
            const classification =
              nextRentCredit === contractRent
                ? ('full_settlement' as const)
                : rentPaymentCount === 0
                  ? ('down_payment' as const)
                  : ('installment' as const);
            runningRentCredit = nextRentCredit;
            rentPaymentCount += 1;
            rentPayments.push({
              classification,
              amount: entry.amount,
              method: entry.method,
              status: decision.status,
              evidenceFileIds,
              paymentNote: entry.note,
              paidAt: entry.paid_at,
            });
          }
        } else if (leadPaymentCommitment) {
          rentPayments.push({
            classification: leadPaymentCommitment.payment_type,
            amount: leadRentCredit ?? 0,
            method: leadPaymentCommitment.payment_method,
            status: leadPaymentCommitment.verification_status,
            evidenceFileIds: leadPaymentCommitment.payment_evidence_file_ids,
            paymentNote: leadPaymentCommitment.payment_note ?? undefined,
            paidAt: leadPaymentCommitment.paid_at,
            transactionCode: leadPaymentCommitment.transaction_code,
          });
          if (isBookingFeeLead && effectiveDpAmount > 0)
            rentPayments.push({
              classification:
                initialRentCredit === contractRent ? 'full_settlement' : 'down_payment',
              amount: effectiveDpAmount,
              method: dto.payment_method,
              status: currentPaymentStatus,
              evidenceFileIds: dto.payment_evidence_file_ids ?? [],
              paymentNote: dto.payment_note,
              paidAt: dto.payment_paid_at,
            });
        } else {
          if (recordedBookingFeeAmount > 0)
            rentPayments.push({
              classification: 'booking_fee',
              amount: recordedBookingFeeAmount,
              method: dto.payment_method,
              status: currentPaymentStatus,
              evidenceFileIds: dto.payment_evidence_file_ids ?? [],
              paymentNote: dto.payment_note,
              paidAt: dto.payment_paid_at,
            });
          if (effectiveDpAmount > 0)
            rentPayments.push({
              classification:
                initialRentCredit === contractRent ? 'full_settlement' : 'down_payment',
              amount: effectiveDpAmount,
              method: dto.payment_method,
              status: currentPaymentStatus,
              evidenceFileIds: dto.payment_evidence_file_ids ?? [],
              paymentNote: dto.payment_note,
              paidAt: dto.payment_paid_at,
            });
        }
        if (!stagedDirectOnboarding)
          securityDepositPayment =
            effectiveSecurityDeposit > 0
              ? {
                  amount: effectiveSecurityDeposit,
                  method:
                    leadPaymentCommitment && !isBookingFeeLead
                      ? leadPaymentCommitment.payment_method
                      : dto.payment_method,
                  status:
                    leadPaymentCommitment && !isBookingFeeLead
                      ? leadPaymentCommitment.verification_status
                      : currentPaymentStatus,
                  evidenceFileIds:
                    leadPaymentCommitment && !isBookingFeeLead
                      ? leadPaymentCommitment.payment_evidence_file_ids
                      : (dto.payment_evidence_file_ids ?? []),
                  paymentNote:
                    (leadPaymentCommitment && !isBookingFeeLead
                      ? leadPaymentCommitment.payment_note
                      : dto.payment_note) ?? undefined,
                  paidAt:
                    leadPaymentCommitment && !isBookingFeeLead
                      ? leadPaymentCommitment.paid_at
                      : dto.payment_paid_at,
                }
              : undefined;
        // W07A models every newly committed lease as one contract-rent
        // obligation. The UI may still use the familiar DP/full-payment choices,
        // but those choices describe the amount received today, not a recurring
        // monthly invoice schedule.
        const contractPaymentPlan = 'annual_full' as const;
        // The legacy DTO field name is retained for wire compatibility. It is the
        // additional rent payment recorded today. A prior booking fee is a rent
        // credit too, while security deposit remains a separate liability.
        const maximumSecurityDeposit = Math.floor(contractRent / dto.term_months);
        if (!Number.isSafeInteger(initialRentCredit) || initialRentCredit < monthlyPrice)
          throw new ConflictException({
            code: 'ONBOARDING_FINANCIAL_OBLIGATION_UNMET',
            message: 'Pembayaran awal sewa harus mencukupi minimal satu bulan sewa',
          });
        if (initialRentCredit > contractRent)
          throw new ConflictException({
            code: 'ONBOARDING_RENT_PAYMENT_EXCEEDS_CONTRACT',
            message: `Total booking fee dan DP atau pelunasan tidak boleh melebihi total sewa kontrak sebesar Rp${contractRent.toLocaleString('id-ID')}`,
          });
        if (
          !Number.isSafeInteger(effectiveSecurityDeposit) ||
          effectiveSecurityDeposit < 0 ||
          effectiveSecurityDeposit > maximumSecurityDeposit
        )
          throw new ConflictException({
            code: 'ONBOARDING_SECURITY_DEPOSIT_EXCEEDS_LIMIT',
            message: `Security deposit bersifat opsional dengan nominal minimal Rp0 dan maksimal Rp${maximumSecurityDeposit.toLocaleString('id-ID')}`,
          });
        const endDate = new Date(`${dto.start_date}T00:00:00.000Z`);
        endDate.setUTCMonth(endDate.getUTCMonth() + dto.term_months);
        const commitment = await client.query<{ id: string }>(
          `INSERT INTO onboarding_commitments(property_id,booking_lead_id,hold_id,resident_id,room_id,category,gender,status,term_months,billing_cycle,payment_plan_type,start_date,end_date,contract_rent_amount,dp_required_amount,dp_verified_amount,security_deposit_required_amount,security_deposit_funded_amount,booking_fee_paid_amount,accepted_terms_version,notes,created_by_user_id,committed_at) VALUES($1,$2,$3,$4,$5,$6,$7,'committed',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now()) RETURNING id`,
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
            contractPaymentPlan,
            dto.start_date,
            endDate.toISOString().slice(0, 10),
            contractRent,
            dpRequired,
            effectiveDpAmount,
            depositRequired,
            effectiveSecurityDeposit,
            recordedBookingFeeAmount,
            dto.accepted_terms_version,
            dto.notes ?? null,
            actor.id,
          ],
        );
        const lease = await client.query<{ id: string }>(
          `INSERT INTO leases(property_id,lease_code,resident_id,room_id,occupancy_id,kost_type_id,lease_status,start_date,end_date,billing_cycle,billing_anchor_day,next_billing_date,snapshot_monthly_price,snapshot_yearly_price,snapshot_deposit_amount,snapshot_room_number,snapshot_kost_type_name,booking_lead_id,onboarding_commitment_id,term_months,payment_plan_type,contract_rent_amount,dp_required_amount,security_deposit_required_amount,signed_at,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,NULL,$5,'awaiting_activation',$6,$7,$8,25,$6::date,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now(),$21,$21) RETURNING id`,
          [
            dto.property_id,
            `ONB-${Date.now()}`,
            residentId,
            room.id,
            room.kost_type_id,
            dto.start_date,
            endDate.toISOString().slice(0, 10),
            dto.billing_cycle,
            monthlyPrice,
            yearlyPrice,
            depositRequired,
            room.room_number,
            room.kost_type_name,
            lead?.id ?? null,
            commitment.rows[0].id,
            dto.term_months,
            contractPaymentPlan,
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
        // A committed awaiting-activation lease reserves its exact room even
        // when it was created directly from /tenants rather than from a
        // Booking Lead hold. Occupancy is still created only by activation.
        const reservedRoom = await client.query<{ id: string }>(
          `UPDATE rooms
             SET room_status='reserved',updated_at=now()
           WHERE id=$1
             AND property_id=$2
             AND room_status IN ('vacant','reserved')
           RETURNING id`,
          [room.id, dto.property_id],
        );
        if (reservedRoom.rowCount !== 1)
          throw new ConflictException({
            code: 'ROOM_RESERVATION_FAILED',
            message: 'Room could not be reserved for the committed lease',
          });
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
        // Canonical W05/W06 issuance authority: the snapshot-derived schedule,
        // its invoices/line items, and the awaiting-activation contract
        // settlement are all created by the shared service so onboarding keeps
        // no duplicate invoice/installment lifecycle SQL of its own.
        const issued = await this.contractScheduleIssuance.issueScheduleInTransaction(client, {
          propertyId: dto.property_id,
          leaseId: lease.rows[0].id,
          startDate: dto.start_date,
          termMonths: dto.term_months,
          paymentPlanType: contractPaymentPlan,
          contractRentAmount: contractRent,
          billingCycle: dto.billing_cycle,
          snapshotMonthlyPrice: monthlyPrice,
          snapshotRoomNumber: room.room_number,
          snapshotBuildingCode: room.building_code,
          snapshotCategoryName: room.kost_type_name,
          initialRentCredit,
          actorUserId: actor.id,
        });
        const firstRentInvoiceId = issued.firstInvoiceId;
        const initialPayment = await this.w06Billing.recordInitialOnboardingPaymentsInTransaction(
          client,
          {
            propertyId: dto.property_id,
            residentId,
            leaseId: lease.rows[0].id,
            firstRentInvoiceId,
            rentPayments,
            securityDepositPayment,
            commandFingerprint: fingerprint,
            actor,
            context,
          },
        );
        const contractPaidDocumentResult = await client.query<{
          id: string;
          document_code: string;
          issued_at: Date;
        }>(
          `SELECT id,document_code,issued_at
             FROM lease_contract_paid_documents
            WHERE property_id=$1 AND lease_id=$2 AND invalidated_at IS NULL
            ORDER BY issued_at DESC,id DESC
            LIMIT 1`,
          [dto.property_id, lease.rows[0].id],
        );
        const contractPaidDocumentRow = contractPaidDocumentResult.rows[0] ?? null;
        const verifiedNonBookingRentAmount = rentPayments.reduce(
          (total, payment) =>
            total +
            (payment.classification !== 'booking_fee' && payment.status === 'verified'
              ? payment.amount
              : 0),
          0,
        );
        await client.query(
          `UPDATE onboarding_commitments
         SET dp_verified_amount=$2,security_deposit_funded_amount=$3,updated_at=now()
         WHERE id=$1 AND property_id=$4`,
          [
            commitment.rows[0].id,
            verifiedNonBookingRentAmount,
            initialPayment.securityDepositVerifiedAmount,
            dto.property_id,
          ],
        );
        if (leadPaymentCommitment) {
          const materialized = await client.query(
            `UPDATE booking_lead_payment_commitments
             SET materialized_onboarding_commitment_id=$2,materialized_at=now(),updated_at=now()
             WHERE id=$1 AND property_id=$3 AND materialized_onboarding_commitment_id IS NULL`,
            [leadPaymentCommitment.id, commitment.rows[0].id, dto.property_id],
          );
          if (materialized.rowCount !== 1)
            throw new ConflictException({
              code: 'BOOKING_LEAD_PAYMENT_COMMITMENT_ALREADY_MATERIALIZED',
              message: 'Initial payment commitment has already been materialized',
            });
        }
        if (hold)
          await client.query(
            `UPDATE booking_lead_holds SET onboarding_commitment_id=$2,release_reason='promoted_to_onboarding',updated_at=now() WHERE id=$1`,
            [hold.id, commitment.rows[0].id],
          );
        if (lead)
          await client.query(
            `UPDATE booking_leads
             SET status='onboarding',
                 resident_id=$2,
                 onboarding_commitment_id=$3,
                 lease_id=$4,
                 preferred_move_in_date=$5::date,
                 updated_at=now()
             WHERE id=$1 AND property_id=$6`,
            [
              lead.id,
              residentId,
              commitment.rows[0].id,
              lease.rows[0].id,
              dto.start_date,
              dto.property_id,
            ],
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
          paymentPlanType: contractPaymentPlan,
          contractRentAmount: contractRent,
          dpRequiredAmount: dpRequired,
          securityDepositRequiredAmount: depositRequired,
          initialPayment,
          contractPaidDocument: contractPaidDocumentRow
            ? {
                id: contractPaidDocumentRow.id,
                documentCode: contractPaidDocumentRow.document_code,
                issuedAt: contractPaidDocumentRow.issued_at.toISOString(),
              }
            : null,
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
    } catch (error) {
      throw this.normalizeUniqueViolation(error, {
        email: dto.visitor_email ?? null,
        phone: dto.visitor_phone ?? null,
        ktpNumber: dto.ktp_number ?? null,
      });
    }
  }

  private async assertNewResidentIdentityAvailable(
    client: PoolClient,
    propertyId: string,
    identity: { email: string | null; phone: string | null; ktpNumber: string | null },
  ): Promise<void> {
    const matches = await client.query<ResidentIdentityRow>(
      `SELECT id,email,phone,ktp_number
       FROM residents
       WHERE property_id=$1
         AND (
           ($2::text IS NOT NULL AND lower(email)=lower($2))
           OR ($3::text IS NOT NULL AND regexp_replace(phone,'[^0-9]','','g')=
             CASE WHEN regexp_replace($3,'[^0-9]','','g') LIKE '0%'
               THEN '62' || substring(regexp_replace($3,'[^0-9]','','g') FROM 2)
               ELSE regexp_replace($3,'[^0-9]','','g')
             END)
           OR ($4::text IS NOT NULL AND ktp_number=$4)
         )
       ORDER BY id
       FOR KEY SHARE`,
      [propertyId, identity.email, identity.phone, identity.ktpNumber],
    );
    const details: Record<string, readonly ['already_used']> = {};
    const normalizedPhone = this.normalizePhoneForComparison(identity.phone);
    for (const row of matches.rows) {
      if (identity.email && row.email?.trim().toLowerCase() === identity.email.trim().toLowerCase())
        details.visitor_email = ['already_used'];
      if (normalizedPhone && this.normalizePhoneForComparison(row.phone) === normalizedPhone)
        details.visitor_phone = ['already_used'];
      if (identity.ktpNumber && row.ktp_number === identity.ktpNumber)
        details.ktp_number = ['already_used'];
    }
    if (Object.keys(details).length > 0)
      throw new ConflictException({
        code: 'RESIDENT_IDENTITY_DUPLICATE',
        message: 'Resident identity is already used in this property',
        details,
      });
  }

  private normalizePhoneForComparison(value: string | null): string | null {
    if (!value) return null;
    const digits = value.replace(/[^0-9]/g, '');
    if (!digits) return null;
    return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
  }

  private normalizeUniqueViolation(
    error: unknown,
    identity: { email: string | null; phone: string | null; ktpNumber: string | null },
  ): unknown {
    if (!error || typeof error !== 'object' || (error as { code?: unknown }).code !== '23505')
      return error;

    const rawConstraint = (error as { constraint?: unknown }).constraint;
    const constraint = typeof rawConstraint === 'string' ? rawConstraint : '';
    if (/onboarding_commitments_active_room|onboarding_commitments_active_lease/i.test(constraint))
      return new ConflictException({
        code: 'ROOM_LIFECYCLE_CONFLICT',
        message: 'Room already has an active onboarding lifecycle',
      });

    const details: Record<string, readonly ['already_used']> = {};
    if (/email/i.test(constraint) && identity.email) details.visitor_email = ['already_used'];
    if (/phone/i.test(constraint) && identity.phone) details.visitor_phone = ['already_used'];
    if (/ktp|nik/i.test(constraint) && identity.ktpNumber) details.ktp_number = ['already_used'];
    if (/residents_property_user|user/i.test(constraint) && Object.keys(details).length === 0) {
      if (identity.email) details.visitor_email = ['already_used'];
      if (identity.phone) details.visitor_phone = ['already_used'];
    }
    if (Object.keys(details).length > 0)
      return new ConflictException({
        code: 'RESIDENT_IDENTITY_DUPLICATE',
        message: 'Resident identity is already used',
        details,
      });
    return error;
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
