import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateResidentDto } from '../dto/create-resident.dto';
import { EmergencyContactDto } from '../dto/emergency-contact.dto';
import { ListResidentsQueryDto } from '../dto/list-residents-query.dto';
import { UpdateResidentDto } from '../dto/update-resident.dto';
import { EmergencyContactRecord, ResidentRecord } from '../types/resident.types';

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
  emergency_phone: string | null;
  ktp_file_id: string | null;
  profile_photo_file_id: string | null;
  gender: ResidentRecord['gender'];
  resident_status: ResidentRecord['residentStatus'];
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
      AND resident_role.name = 'resident'
  )`;
}

@Injectable()
export class ResidentRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListResidentsQueryDto, propertyIds?: string[]): Promise<ResidentRecord[]> {
    const result = await this.database.client.query<ResidentRow>(
      `SELECT id, property_id, user_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
              emergency_phone, ktp_file_id, profile_photo_file_id, gender, resident_status, created_at, updated_at
       FROM residents
       WHERE ($1::uuid[] IS NULL OR property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR property_id = $2)
         AND ($3::text IS NULL OR resident_status = $3)
         AND (
           $4::text IS NULL
           OR full_name ILIKE '%' || $4 || '%'
           OR phone ILIKE '%' || $4 || '%'
           OR email ILIKE '%' || $4 || '%'
         )
       ORDER BY created_at DESC`,
      [
        propertyIds?.length ? propertyIds : null,
        query.property_id ?? null,
        query.status ?? null,
        query.q ?? null,
      ],
    );
    return this.hydrate(result.rows);
  }

  async findById(id: string): Promise<ResidentRecord | null> {
    const result = await this.database.client.query<ResidentRow>(
      `SELECT id, property_id, user_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
              emergency_phone, ktp_file_id, profile_photo_file_id, gender, resident_status, created_at, updated_at
       FROM residents
       WHERE id = $1`,
      [id],
    );
    const residents = await this.hydrate(result.rows);
    return residents[0] ?? null;
  }

  async create(dto: CreateResidentDto, actorUserId: string): Promise<ResidentRecord> {
    const result = await this.database.client.query<ResidentRow>(
      `INSERT INTO residents (
         property_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
         emergency_phone, ktp_file_id, profile_photo_file_id, gender,
         created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
       RETURNING id, property_id, user_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
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
           emergency_phone = COALESCE($9, emergency_phone),
           ktp_file_id = COALESCE($10, ktp_file_id),
           profile_photo_file_id = COALESCE($11, profile_photo_file_id),
           gender = COALESCE($12, gender),
           updated_by_user_id = $13,
           updated_at = now()
       WHERE id = $1
       RETURNING id, property_id, user_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
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
        dto.emergency_phone ?? null,
        dto.ktp_file_id ?? null,
        dto.profile_photo_file_id ?? null,
        dto.gender ?? null,
        actorUserId,
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
      emergencyPhone: row.emergency_phone,
      ktpFileId: row.ktp_file_id,
      profilePhotoFileId: row.profile_photo_file_id,
      gender: row.gender,
      residentStatus: row.resident_status,
      emergencyContacts: contactsByResident.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}
