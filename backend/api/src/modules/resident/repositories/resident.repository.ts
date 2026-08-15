import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateResidentDto } from '../dto/create-resident.dto';
import { EmergencyContactDto } from '../dto/emergency-contact.dto';
import { ListResidentsQueryDto } from '../dto/list-residents-query.dto';
import { UpdateResidentDto } from '../dto/update-resident.dto';
import {
  EmergencyContactRecord,
  ResidentRecord,
  ResidentTenancyRecord,
} from '../types/resident.types';

type ResidentRow = {
  id: string;
  property_id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  ktp_number: string | null;
  date_of_birth: Date | null;
  place_of_birth: string | null;
  address: string | null;
  university: string | null;
  faculty: string | null;
  major: string | null;
  cohort: string | null;
  instagram: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  marital_status: string | null;
  emergency_phone: string | null;
  ktp_file_id: string | null;
  profile_photo_file_id: string | null;
  gender: ResidentRecord['gender'];
  resident_status: ResidentRecord['residentStatus'];
  account_status?: ResidentRecord['accountStatus'];
  rent_payment_status?: ResidentRecord['rentPaymentStatus'];
  contract_settlement_stage?: ResidentRecord['contractSettlementStage'];
  contract_settlement_due_date?: string | null;
  contract_settlement_remaining_amount?: string;
  contract_settlement_checkpoint_required_amount?: string;
  room_number?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  lease_authority_count?: string;
  created_at: Date;
  updated_at: Date;
};

type ContactRow = {
  id: string;
  resident_id: string;
  contact_name: string;
  relationship: string | null;
  phone: string;
};

type ResidentTenancyRow = {
  resident_id: string;
  property_id: string;
  lease_id: string;
  lease_status: ResidentTenancyRecord['leaseStatus'];
  room_number: string;
  kost_type_name: string;
  building_code: string;
  start_date: string;
  end_date: string;
  term_months: number;
  payment_plan_type: ResidentTenancyRecord['paymentPlanType'];
};

export type ResidentSelfContext = {
  displayName: string;
  phone: string | null;
  propertyName: string;
  roomNumber: string;
  occupancyStart: string;
};

export type PropertyOwnerResidentSummary = {
  displayName: string;
  roomNumber: string | null;
  status: ResidentRecord['residentStatus'];
};

export function residentPropertyMembershipSql(userParameter: '$1' | '$2'): string {
  return `EXISTS (
    SELECT 1
    FROM user_property_roles AS resident_membership
    JOIN roles AS resident_role ON resident_role.id = resident_membership.role_id
    WHERE resident_membership.user_id = ${userParameter}
      AND resident_membership.property_id = residents.property_id
      AND resident_membership.revoked_at IS NULL
      AND resident_role.code = 'resident'
  )`;
}

@Injectable()
export class ResidentRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListResidentsQueryDto, propertyIds?: string[]): Promise<ResidentRecord[]> {
    const result = await this.database.client.query<ResidentRow>(
      `SELECT residents.id, residents.property_id, residents.user_id, residents.full_name,
              residents.phone, residents.email, residents.ktp_number, residents.date_of_birth,
              residents.place_of_birth, residents.address,
              university, faculty, major, cohort, instagram, parent_name, parent_phone, marital_status,
              residents.emergency_phone, residents.ktp_file_id, residents.profile_photo_file_id,
              residents.gender, residents.resident_status, residents.created_at, residents.updated_at,
              COALESCE(users.user_status, 'not_provisioned') AS account_status,
              CASE WHEN lease_authority.authority_count = 1 THEN lease_authority.room_number END AS room_number,
              CASE WHEN lease_authority.authority_count = 1 THEN lease_authority.start_date END AS lease_start,
              CASE WHEN lease_authority.authority_count = 1 THEN lease_authority.end_date END AS lease_end,
              COALESCE(lease_authority.authority_count, 0)::text AS lease_authority_count,
              COALESCE(payment_authority.rent_payment_status, 'none') AS rent_payment_status,
              COALESCE(payment_authority.contract_settlement_stage, 'none') AS contract_settlement_stage,
              payment_authority.contract_settlement_due_date,
              COALESCE(payment_authority.contract_settlement_remaining_amount, 0)::text
                AS contract_settlement_remaining_amount,
              COALESCE(payment_authority.contract_settlement_checkpoint_required_amount, 0)::text
                AS contract_settlement_checkpoint_required_amount
       FROM residents
       LEFT JOIN users ON users.id = residents.user_id
        LEFT JOIN LATERAL (
          SELECT count(*)::integer AS authority_count,
                 min(leases.id::text) AS lease_id,
                 min(rooms.number) AS room_number,
                 min(leases.start_date)::text AS start_date,
                 min(leases.end_date)::text AS end_date,
                 min(leases.lease_status::text) AS lease_status
          FROM leases
          JOIN rooms ON rooms.id = leases.room_id
                    AND rooms.property_id = leases.property_id
          WHERE leases.resident_id = residents.id
            AND leases.property_id = residents.property_id
            AND leases.lease_status IN ('awaiting_activation', 'active')
        ) AS lease_authority ON TRUE
       LEFT JOIN LATERAL (
         WITH authority AS (
           SELECT settlement.id AS settlement_id,settlement.state,settlement.activated_at,
                  settlement.original_due_at,settlement.extension_due_at,
                  invoice.total_amount,invoice.credit_amount,lease.snapshot_monthly_price,
                  COALESCE(commitment.dp_verified_amount,0) AS dp_verified_amount,
                  COALESCE(commitment.booking_fee_paid_amount,0) AS booking_fee_paid_amount,
                  termination.id AS termination_case_id,
                  COALESCE(allocation.net,0) AS allocated_amount,
                  COALESCE(initial_payment.net,0) AS initial_payment_allocated
             FROM leases AS lease
             LEFT JOIN onboarding_commitments AS commitment
               ON commitment.id = lease.onboarding_commitment_id
              AND commitment.property_id = lease.property_id
              AND commitment.resident_id = lease.resident_id
             LEFT JOIN lease_contract_settlements AS settlement
               ON settlement.lease_id = lease.id
              AND settlement.property_id = lease.property_id
             LEFT JOIN invoices AS invoice
               ON invoice.id = settlement.invoice_id
              AND invoice.property_id = settlement.property_id
             LEFT JOIN LATERAL (
               SELECT COALESCE(sum(payment_allocation.allocated_amount),0)
                        - COALESCE(sum(reversal_allocation.reversed_amount),0) AS net
                 FROM payment_allocations payment_allocation
                 LEFT JOIN payment_reversal_allocations reversal_allocation
                   ON reversal_allocation.original_allocation_id=payment_allocation.id
                WHERE payment_allocation.invoice_id=invoice.id
             ) allocation ON true
             LEFT JOIN LATERAL (
               SELECT COALESCE(sum(payment_allocation.allocated_amount)
                        FILTER (WHERE payment.payment_code LIKE 'PAY-ONB-%'),0)
                        - COALESCE(sum(reversal_allocation.reversed_amount)
                        FILTER (WHERE payment.payment_code LIKE 'PAY-ONB-%'),0) AS net
                 FROM payment_allocations payment_allocation
                 JOIN payments payment ON payment.id=payment_allocation.payment_id
                 LEFT JOIN payment_reversal_allocations reversal_allocation
                   ON reversal_allocation.original_allocation_id=payment_allocation.id
                WHERE payment_allocation.invoice_id=invoice.id
             ) initial_payment ON true
             LEFT JOIN lease_termination_cases termination
               ON termination.settlement_id=settlement.id AND termination.status='pending'
            WHERE lease.id = lease_authority.lease_id::uuid
              AND lease.property_id = residents.property_id
         ), computed AS (
           SELECT authority.*,
                  GREATEST(COALESCE(total_amount,0)-COALESCE(credit_amount,0)-allocated_amount,0)
                    AS remaining_amount,
                  LEAST(COALESCE(snapshot_monthly_price,0),
                    GREATEST(COALESCE(total_amount,0)-initial_payment_allocated,0))
                    AS checkpoint_required_amount,
                  GREATEST(allocated_amount-initial_payment_allocated,0) AS checkpoint_paid_amount,
                  (((activated_at AT TIME ZONE 'Asia/Jakarta')::date + INTERVAL '1 month'
                    + INTERVAL '1 day' - INTERVAL '1 microsecond') AT TIME ZONE 'Asia/Jakarta')
                    AS checkpoint_due_at,
                  COALESCE(extension_due_at,original_due_at) AS final_due_at
             FROM authority
         )
         SELECT CASE
           WHEN state = 'paid' OR remaining_amount=0 THEN 'paid_in_full'
           WHEN allocated_amount > initial_payment_allocated THEN 'partial_payment'
           WHEN dp_verified_amount > 0 THEN 'down_payment'
           WHEN booking_fee_paid_amount > 0 THEN 'booking_fee'
           ELSE 'none'
         END::text AS rent_payment_status,
         CASE
           WHEN settlement_id IS NULL THEN CASE WHEN lease_authority.lease_status='awaiting_activation' THEN 'awaiting_activation' ELSE 'none' END
           WHEN state='awaiting_activation' THEN 'awaiting_activation'
           WHEN state='paid' OR remaining_amount=0 THEN 'paid_in_full'
           WHEN termination_case_id IS NOT NULL THEN 'termination_pending'
           WHEN now() > CASE WHEN extension_due_at IS NULL THEN final_due_at + INTERVAL '7 days' ELSE final_due_at END THEN 'admin_action_required'
           WHEN now() > final_due_at THEN 'overdue'
           WHEN checkpoint_required_amount>checkpoint_paid_amount AND now()>checkpoint_due_at THEN 'overdue'
           WHEN checkpoint_required_amount>checkpoint_paid_amount THEN 'checkpoint_one_pending'
           WHEN now()>=checkpoint_due_at THEN 'final_settlement_due'
           ELSE 'checkpoint_one_met'
         END::text AS contract_settlement_stage,
         TO_CHAR((CASE
           WHEN settlement_id IS NOT NULL AND checkpoint_required_amount>checkpoint_paid_amount AND now()<=checkpoint_due_at THEN checkpoint_due_at
           ELSE final_due_at
         END) AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS contract_settlement_due_date,
         remaining_amount AS contract_settlement_remaining_amount,
         checkpoint_required_amount AS contract_settlement_checkpoint_required_amount
         FROM computed
       ) AS payment_authority ON lease_authority.authority_count = 1
       WHERE ($1::uuid[] IS NULL OR residents.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR residents.property_id = $2)
         AND ($3::text IS NULL OR residents.resident_status = $3)
         AND ($4::text IS NULL OR COALESCE(users.user_status, 'not_provisioned') = $4)
         AND ($5::text IS NULL OR payment_authority.rent_payment_status = $5)
         AND ($6::text IS NULL OR residents.gender = $6)
         AND (
           $7::text IS NULL
           OR ($7 = 'none' AND COALESCE(lease_authority.authority_count, 0) = 0)
           OR ($7 <> 'none' AND lease_authority.authority_count = 1 AND lease_authority.lease_status = $7)
         )
         AND (
           $8::text IS NULL
           OR residents.full_name ILIKE '%' || $8 || '%'
           OR residents.phone ILIKE '%' || $8 || '%'
           OR residents.email ILIKE '%' || $8 || '%'
           OR residents.university ILIKE '%' || $8 || '%'
           OR residents.faculty ILIKE '%' || $8 || '%'
           OR residents.major ILIKE '%' || $8 || '%'
           OR lease_authority.room_number ILIKE '%' || $8 || '%'
         )
         AND ($9::date IS NULL OR (residents.created_at AT TIME ZONE 'Asia/Jakarta')::date >= $9::date)
         AND ($10::date IS NULL OR (residents.created_at AT TIME ZONE 'Asia/Jakarta')::date <= $10::date)
         AND ($11::text IS NULL OR payment_authority.contract_settlement_stage = $11)
         AND ($12::integer IS NULL OR (
           payment_authority.contract_settlement_due_date IS NOT NULL
           AND payment_authority.contract_settlement_due_date::date >= (now() AT TIME ZONE 'Asia/Jakarta')::date
           AND payment_authority.contract_settlement_due_date::date <= (now() AT TIME ZONE 'Asia/Jakarta')::date + $12::integer
         ))
       ORDER BY residents.created_at DESC, residents.id DESC
       LIMIT $13 OFFSET $14`,
      [
        propertyIds === undefined ? null : propertyIds,
        query.property_id ?? null,
        query.status ?? null,
        query.account_status ?? null,
        query.rent_payment_status ?? null,
        query.gender ?? null,
        query.tenancy_status ?? null,
        query.q?.trim() || null,
        query.created_from ?? null,
        query.created_to ?? null,
        query.contract_settlement_stage ?? null,
        query.settlement_due_within_days ?? null,
        Math.min(Math.max(query.limit ?? 20, 1), 100),
        Math.max(query.offset ?? 0, 0),
      ],
    );
    return this.hydrate(result.rows);
  }

  async count(query: ListResidentsQueryDto, propertyIds?: string[]): Promise<number> {
    const result = await this.database.client.query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM residents
       LEFT JOIN users ON users.id = residents.user_id
       LEFT JOIN LATERAL (
          SELECT count(*)::integer AS authority_count,
                 min(leases.id::text) AS lease_id,
                 min(rooms.number) AS room_number,
                 min(leases.lease_status::text) AS lease_status
          FROM leases
          JOIN rooms ON rooms.id = leases.room_id
                    AND rooms.property_id = leases.property_id
          WHERE leases.resident_id = residents.id
            AND leases.property_id = residents.property_id
            AND leases.lease_status IN ('awaiting_activation', 'active')
        ) AS lease_authority ON TRUE
       LEFT JOIN LATERAL (
         WITH authority AS (
           SELECT settlement.id AS settlement_id,settlement.state,settlement.activated_at,
                  settlement.original_due_at,settlement.extension_due_at,
                  invoice.total_amount,invoice.credit_amount,lease.snapshot_monthly_price,
                  COALESCE(commitment.dp_verified_amount,0) AS dp_verified_amount,
                  COALESCE(commitment.booking_fee_paid_amount,0) AS booking_fee_paid_amount,
                  termination.id AS termination_case_id,
                  COALESCE(allocation.net,0) AS allocated_amount,
                  COALESCE(initial_payment.net,0) AS initial_payment_allocated
             FROM leases AS lease
             LEFT JOIN onboarding_commitments AS commitment
               ON commitment.id=lease.onboarding_commitment_id
              AND commitment.property_id=lease.property_id
              AND commitment.resident_id=lease.resident_id
             LEFT JOIN lease_contract_settlements AS settlement
               ON settlement.lease_id=lease.id AND settlement.property_id=lease.property_id
             LEFT JOIN invoices AS invoice
               ON invoice.id=settlement.invoice_id AND invoice.property_id=settlement.property_id
             LEFT JOIN LATERAL (
               SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net
                 FROM payment_allocations pa
                 LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id
                WHERE pa.invoice_id=invoice.id
             ) allocation ON true
             LEFT JOIN LATERAL (
               SELECT COALESCE(sum(pa.allocated_amount) FILTER (WHERE payment.payment_code LIKE 'PAY-ONB-%'),0)
                      -COALESCE(sum(pra.reversed_amount) FILTER (WHERE payment.payment_code LIKE 'PAY-ONB-%'),0) AS net
                 FROM payment_allocations pa
                 JOIN payments payment ON payment.id=pa.payment_id
                 LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id
                WHERE pa.invoice_id=invoice.id
             ) initial_payment ON true
             LEFT JOIN lease_termination_cases termination
               ON termination.settlement_id=settlement.id AND termination.status='pending'
            WHERE lease.id=lease_authority.lease_id::uuid
              AND lease.property_id=residents.property_id
         ), computed AS (
           SELECT authority.*,
                  GREATEST(COALESCE(total_amount,0)-COALESCE(credit_amount,0)-allocated_amount,0) AS remaining_amount,
                  LEAST(COALESCE(snapshot_monthly_price,0),GREATEST(COALESCE(total_amount,0)-initial_payment_allocated,0)) AS checkpoint_required_amount,
                  GREATEST(allocated_amount-initial_payment_allocated,0) AS checkpoint_paid_amount,
                  (((activated_at AT TIME ZONE 'Asia/Jakarta')::date+INTERVAL '1 month'+INTERVAL '1 day'-INTERVAL '1 microsecond') AT TIME ZONE 'Asia/Jakarta') AS checkpoint_due_at,
                  COALESCE(extension_due_at,original_due_at) AS final_due_at
             FROM authority
         )
         SELECT CASE
           WHEN state='paid' OR remaining_amount=0 THEN 'paid_in_full'
           WHEN allocated_amount>initial_payment_allocated THEN 'partial_payment'
           WHEN dp_verified_amount>0 THEN 'down_payment'
           WHEN booking_fee_paid_amount>0 THEN 'booking_fee'
           ELSE 'none'
         END::text AS rent_payment_status,
         CASE
           WHEN settlement_id IS NULL THEN CASE WHEN lease_authority.lease_status='awaiting_activation' THEN 'awaiting_activation' ELSE 'none' END
           WHEN state='awaiting_activation' THEN 'awaiting_activation'
           WHEN state='paid' OR remaining_amount=0 THEN 'paid_in_full'
           WHEN termination_case_id IS NOT NULL THEN 'termination_pending'
           WHEN now()>CASE WHEN extension_due_at IS NULL THEN final_due_at+INTERVAL '7 days' ELSE final_due_at END THEN 'admin_action_required'
           WHEN now()>final_due_at THEN 'overdue'
           WHEN checkpoint_required_amount>checkpoint_paid_amount AND now()>checkpoint_due_at THEN 'overdue'
           WHEN checkpoint_required_amount>checkpoint_paid_amount THEN 'checkpoint_one_pending'
           WHEN now()>=checkpoint_due_at THEN 'final_settlement_due'
           ELSE 'checkpoint_one_met'
         END::text AS contract_settlement_stage,
         TO_CHAR((CASE WHEN settlement_id IS NOT NULL AND checkpoint_required_amount>checkpoint_paid_amount AND now()<=checkpoint_due_at THEN checkpoint_due_at ELSE final_due_at END) AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS contract_settlement_due_date
         FROM computed
       ) AS payment_authority ON lease_authority.authority_count = 1
       WHERE ($1::uuid[] IS NULL OR residents.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR residents.property_id = $2)
         AND ($3::text IS NULL OR residents.resident_status = $3)
         AND ($4::text IS NULL OR COALESCE(users.user_status, 'not_provisioned') = $4)
         AND ($5::text IS NULL OR payment_authority.rent_payment_status = $5)
         AND ($6::text IS NULL OR residents.gender = $6)
         AND (
           $7::text IS NULL
           OR ($7 = 'none' AND COALESCE(lease_authority.authority_count, 0) = 0)
           OR ($7 <> 'none' AND lease_authority.authority_count = 1 AND lease_authority.lease_status = $7)
         )
         AND (
           $8::text IS NULL
           OR residents.full_name ILIKE '%' || $8 || '%'
           OR residents.phone ILIKE '%' || $8 || '%'
           OR residents.email ILIKE '%' || $8 || '%'
           OR residents.university ILIKE '%' || $8 || '%'
           OR residents.faculty ILIKE '%' || $8 || '%'
           OR residents.major ILIKE '%' || $8 || '%'
           OR lease_authority.room_number ILIKE '%' || $8 || '%'
         )
         AND ($9::date IS NULL OR (residents.created_at AT TIME ZONE 'Asia/Jakarta')::date >= $9::date)
         AND ($10::date IS NULL OR (residents.created_at AT TIME ZONE 'Asia/Jakarta')::date <= $10::date)
         AND ($11::text IS NULL OR payment_authority.contract_settlement_stage=$11)
         AND ($12::integer IS NULL OR (
           payment_authority.contract_settlement_due_date IS NOT NULL
           AND payment_authority.contract_settlement_due_date::date >= (now() AT TIME ZONE 'Asia/Jakarta')::date
           AND payment_authority.contract_settlement_due_date::date <= (now() AT TIME ZONE 'Asia/Jakarta')::date+$12::integer
         ))`,
      [
        propertyIds === undefined ? null : propertyIds,
        query.property_id ?? null,
        query.status ?? null,
        query.account_status ?? null,
        query.rent_payment_status ?? null,
        query.gender ?? null,
        query.tenancy_status ?? null,
        query.q?.trim() || null,
        query.created_from ?? null,
        query.created_to ?? null,
        query.contract_settlement_stage ?? null,
        query.settlement_due_within_days ?? null,
      ],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async findById(id: string): Promise<ResidentRecord | null> {
    return this.findByIdScoped(id, null);
  }

  async findByIdInProperty(id: string, propertyId: string): Promise<ResidentRecord | null> {
    return this.findByIdScoped(id, propertyId);
  }

  async findCurrentTenanciesInProperty(
    residentId: string,
    propertyId: string,
  ): Promise<ResidentTenancyRecord[]> {
    const result = await this.database.client.query<ResidentTenancyRow>(
      `SELECT leases.resident_id,leases.property_id,leases.id AS lease_id,leases.lease_status,
              rooms.number AS room_number,leases.snapshot_kost_type_name AS kost_type_name,
              buildings.building_code,leases.start_date::text,leases.end_date::text,
              leases.term_months,leases.payment_plan_type
       FROM leases
       JOIN rooms ON rooms.id=leases.room_id AND rooms.property_id=leases.property_id
       JOIN room_buildings AS buildings
         ON buildings.id=rooms.building_id AND buildings.property_id=leases.property_id
       WHERE leases.resident_id=$1
         AND leases.property_id=$2
         AND leases.lease_status IN ('awaiting_activation','active')
       ORDER BY CASE leases.lease_status WHEN 'active' THEN 0 ELSE 1 END, leases.created_at DESC, leases.id DESC
       LIMIT 2`,
      [residentId, propertyId],
    );
    return result.rows.map((row) => ({
      residentId: row.resident_id,
      propertyId: row.property_id,
      leaseId: row.lease_id,
      leaseStatus: row.lease_status,
      roomNumber: row.room_number,
      kostTypeName: row.kost_type_name,
      buildingCode: row.building_code,
      startDate: row.start_date,
      endDate: row.end_date,
      termMonths: Number(row.term_months),
      paymentPlanType: row.payment_plan_type,
    }));
  }

  private async findByIdScoped(
    id: string,
    propertyId: string | null,
  ): Promise<ResidentRecord | null> {
    const result = await this.database.client.query<ResidentRow>(
      `SELECT residents.id, residents.property_id, residents.user_id, residents.full_name,
              residents.phone, residents.email, residents.ktp_number, residents.date_of_birth,
              residents.place_of_birth, residents.address,
              university, faculty, major, cohort, instagram, parent_name, parent_phone, marital_status,
              residents.emergency_phone, residents.ktp_file_id, residents.profile_photo_file_id,
              residents.gender, residents.resident_status, residents.created_at, residents.updated_at,
              COALESCE(users.user_status, 'not_provisioned') AS account_status
       FROM residents
       LEFT JOIN users ON users.id = residents.user_id
       WHERE residents.id = $1
         AND ($2::uuid IS NULL OR residents.property_id = $2)`,
      [id, propertyId],
    );
    const residents = await this.hydrate(result.rows);
    return residents[0] ?? null;
  }

  async create(dto: CreateResidentDto, actorUserId: string): Promise<ResidentRecord> {
    const result = await this.database.client.query<ResidentRow>(
      `INSERT INTO residents (
         property_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
         university, faculty, major, cohort, instagram, parent_name, parent_phone, marital_status,
         emergency_phone, ktp_file_id, profile_photo_file_id, gender,
         created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, $18, $19, $20, $21, $21)
       RETURNING id, property_id, user_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
                 university, faculty, major, cohort, instagram, parent_name, parent_phone, marital_status,
                 emergency_phone, ktp_file_id, profile_photo_file_id, gender, resident_status, created_at, updated_at`,
      [
        dto.property_id,
        dto.full_name,
        dto.phone ?? null,
        dto.email ?? null,
        dto.ktp_number ?? null,
        dto.date_of_birth ?? null,
        dto.place_of_birth ?? null,
        dto.address ?? null,
        dto.university ?? null,
        dto.faculty ?? null,
        dto.major ?? null,
        dto.cohort ?? null,
        dto.instagram ?? null,
        dto.parent_name ?? null,
        dto.parent_phone ?? null,
        dto.marital_status ?? null,
        dto.emergency_phone ?? null,
        dto.ktp_file_id ?? null,
        dto.profile_photo_file_id ?? null,
        dto.gender ?? null,
        actorUserId,
      ],
    );

    await this.replaceEmergencyContacts(result.rows[0].id, dto.emergency_contacts ?? []);
    return (await this.findById(result.rows[0].id)) as ResidentRecord;
  }

  async update(
    id: string,
    dto: UpdateResidentDto,
    actorUserId: string,
  ): Promise<ResidentRecord | null> {
    const result = await this.database.client.query<ResidentRow>(
      `UPDATE residents
       SET full_name = COALESCE($2, full_name),
           phone = COALESCE($3, phone),
           email = COALESCE($4, email),
           ktp_number = COALESCE($5, ktp_number),
           date_of_birth = COALESCE($6, date_of_birth),
           place_of_birth = COALESCE($7, place_of_birth),
           address = COALESCE($8, address),
           university = COALESCE($9, university),
           faculty = COALESCE($10, faculty),
           major = COALESCE($11, major),
           cohort = COALESCE($12, cohort),
           instagram = COALESCE($13, instagram),
           parent_name = COALESCE($14, parent_name),
           parent_phone = COALESCE($15, parent_phone),
           marital_status = COALESCE($16, marital_status),
           emergency_phone = COALESCE($17, emergency_phone),
           ktp_file_id = CASE WHEN $22 THEN $18 ELSE ktp_file_id END,
           profile_photo_file_id = COALESCE($19, profile_photo_file_id),
           gender = COALESCE($20, gender),
           updated_by_user_id = $21,
           updated_at = now()
       WHERE id = $1
       RETURNING id, property_id, user_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
                 university, faculty, major, cohort, instagram, parent_name, parent_phone, marital_status,
                 emergency_phone, ktp_file_id, profile_photo_file_id, gender, resident_status, created_at, updated_at`,
      [
        id,
        dto.full_name ?? null,
        dto.phone ?? null,
        dto.email ?? null,
        dto.ktp_number ?? null,
        dto.date_of_birth ?? null,
        dto.place_of_birth ?? null,
        dto.address ?? null,
        dto.university ?? null,
        dto.faculty ?? null,
        dto.major ?? null,
        dto.cohort ?? null,
        dto.instagram ?? null,
        dto.parent_name ?? null,
        dto.parent_phone ?? null,
        dto.marital_status ?? null,
        dto.emergency_phone ?? null,
        dto.ktp_file_id ?? null,
        dto.profile_photo_file_id ?? null,
        dto.gender ?? null,
        actorUserId,
        Object.prototype.hasOwnProperty.call(dto, 'ktp_file_id'),
      ],
    );

    if (!result.rows[0]) {
      return null;
    }
    if (dto.emergency_contacts) {
      await this.replaceEmergencyContacts(id, dto.emergency_contacts);
    }
    return this.findById(id);
  }

  async findActiveContextsForUser(userId: string): Promise<ResidentSelfContext[]> {
    const result = await this.database.client.query<{
      display_name: string;
      phone: string | null;
      property_name: string;
      room_number: string;
      occupancy_start: string;
    }>(
      `SELECT residents.full_name AS display_name,
              residents.phone,
              properties.name AS property_name,
              rooms.number AS room_number,
              occupancies.start_date::text AS occupancy_start
       FROM residents
       JOIN occupancies ON occupancies.resident_id = residents.id
       JOIN rooms ON rooms.id = occupancies.room_id
       JOIN properties ON properties.id = residents.property_id
       WHERE residents.user_id = $1
         AND residents.resident_status = 'active'
         AND occupancies.occupancy_status = 'active'
         AND occupancies.end_date IS NULL
         AND occupancies.property_id = residents.property_id
         AND rooms.property_id = residents.property_id
         AND properties.id = residents.property_id
         AND ${residentPropertyMembershipSql('$1')}
       ORDER BY occupancies.start_date DESC, occupancies.id ASC
       LIMIT 2`,
      [userId],
    );
    return result.rows.map((row) => ({
      displayName: row.display_name,
      phone: row.phone,
      propertyName: row.property_name,
      roomNumber: row.room_number,
      occupancyStart: row.occupancy_start,
    }));
  }

  async listPropertyOwnerSummary(propertyId: string): Promise<PropertyOwnerResidentSummary[]> {
    const result = await this.database.client.query<{
      display_name: string;
      room_number: string | null;
      status: ResidentRecord['residentStatus'];
    }>(
      `SELECT residents.full_name AS display_name,
              CASE
                WHEN count(occupancies.id) = 1 THEN min(rooms.number)
                ELSE NULL
              END AS room_number,
              residents.resident_status AS status
       FROM residents
       LEFT JOIN occupancies
         ON occupancies.resident_id = residents.id
        AND occupancies.property_id = residents.property_id
        AND occupancies.occupancy_status = 'active'
        AND occupancies.end_date IS NULL
       LEFT JOIN rooms
         ON rooms.id = occupancies.room_id
        AND rooms.property_id = residents.property_id
       WHERE residents.property_id = $1
       GROUP BY residents.id, residents.full_name, residents.resident_status
       ORDER BY residents.full_name ASC, residents.id ASC`,
      [propertyId],
    );
    return result.rows.map((row) => ({
      displayName: row.display_name,
      roomNumber: row.room_number,
      status: row.status,
    }));
  }

  async updateStatus(
    id: string,
    status: ResidentRecord['residentStatus'],
    actorUserId: string,
  ): Promise<ResidentRecord | null> {
    const result = await this.database.client.query<ResidentRow>(
      `UPDATE residents
       SET resident_status = $2,
           updated_by_user_id = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING id, property_id, user_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
                 university, faculty, major, cohort, instagram, parent_name, parent_phone, marital_status,
                 emergency_phone, ktp_file_id, profile_photo_file_id, gender, resident_status, created_at, updated_at`,
      [id, status, actorUserId],
    );
    if (!result.rows[0]) {
      return null;
    }
    return this.findById(id);
  }

  private async replaceEmergencyContacts(
    residentId: string,
    contacts: EmergencyContactDto[],
  ): Promise<void> {
    await this.database.client.query(
      'DELETE FROM resident_emergency_contacts WHERE resident_id = $1',
      [residentId],
    );
    for (const contact of contacts) {
      await this.database.client.query(
        `INSERT INTO resident_emergency_contacts (resident_id, contact_name, relationship, phone)
         VALUES ($1, $2, $3, $4)`,
        [residentId, contact.contact_name, contact.relationship ?? null, contact.phone],
      );
    }
  }

  private async hydrate(rows: ResidentRow[]): Promise<ResidentRecord[]> {
    if (!rows.length) {
      return [];
    }
    const residentIds = rows.map((row) => row.id);
    const contactResult = await this.database.client.query<ContactRow>(
      `SELECT id, resident_id, contact_name, relationship, phone
       FROM resident_emergency_contacts
       WHERE resident_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [residentIds],
    );
    const contactsByResident = new Map<string, EmergencyContactRecord[]>();
    for (const row of contactResult.rows) {
      const contacts = contactsByResident.get(row.resident_id) ?? [];
      contacts.push({
        id: row.id,
        residentId: row.resident_id,
        contactName: row.contact_name,
        relationship: row.relationship,
        phone: row.phone,
      });
      contactsByResident.set(row.resident_id, contacts);
    }
    return rows.map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      userId: row.user_id,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      ktpNumber: row.ktp_number,
      dateOfBirth: row.date_of_birth,
      placeOfBirth: row.place_of_birth,
      address: row.address,
      university: row.university,
      faculty: row.faculty,
      major: row.major,
      cohort: row.cohort,
      instagram: row.instagram,
      parentName: row.parent_name,
      parentPhone: row.parent_phone,
      maritalStatus: row.marital_status,
      emergencyPhone: row.emergency_phone,
      ktpFileId: row.ktp_file_id,
      profilePhotoFileId: row.profile_photo_file_id,
      gender: row.gender,
      residentStatus: row.resident_status,
      accountStatus: row.account_status ?? (row.user_id ? 'active' : 'not_provisioned'),
      rentPaymentStatus: row.rent_payment_status ?? 'none',
      contractSettlementStage: row.contract_settlement_stage ?? 'none',
      contractSettlementDueDate: row.contract_settlement_due_date ?? null,
      contractSettlementRemainingAmount: Number(row.contract_settlement_remaining_amount ?? 0),
      contractSettlementCheckpointRequiredAmount: Number(
        row.contract_settlement_checkpoint_required_amount ?? 0,
      ),
      roomNumber: row.room_number ?? null,
      leaseStart: row.lease_start ?? null,
      leaseEnd: row.lease_end ?? null,
      leaseAuthorityCount: Number(row.lease_authority_count ?? 0),
      emergencyContacts: contactsByResident.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}
