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

@Injectable()
export class ResidentRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListResidentsQueryDto, propertyIds?: string[]): Promise<ResidentRecord[]> {
    const result = await this.database.client.query<ResidentRow>(
      `SELECT id, property_id, user_id, full_name, phone, email, ktp_number, gender,
              resident_status, created_at, updated_at
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
      `SELECT id, property_id, user_id, full_name, phone, email, ktp_number, gender,
              resident_status, created_at, updated_at
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
         property_id, user_id, full_name, phone, email, ktp_number, gender,
         created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id, property_id, user_id, full_name, phone, email, ktp_number, gender,
                 resident_status, created_at, updated_at`,
      [
        dto.property_id,
        dto.user_id ?? null,
        dto.full_name,
        dto.phone ?? null,
        dto.email ?? null,
        dto.ktp_number ?? null,
        dto.gender ?? null,
        actorUserId,
      ],
    );

    await this.replaceEmergencyContacts(result.rows[0].id, dto.emergency_contacts ?? []);
    return (await this.findById(result.rows[0].id)) as ResidentRecord;
  }

  async update(id: string, dto: UpdateResidentDto, actorUserId: string): Promise<ResidentRecord | null> {
    const result = await this.database.client.query<ResidentRow>(
      `UPDATE residents
       SET user_id = COALESCE($2, user_id),
           full_name = COALESCE($3, full_name),
           phone = COALESCE($4, phone),
           email = COALESCE($5, email),
           ktp_number = COALESCE($6, ktp_number),
           gender = COALESCE($7, gender),
           updated_by_user_id = $8,
           updated_at = now()
       WHERE id = $1
       RETURNING id, property_id, user_id, full_name, phone, email, ktp_number, gender,
                 resident_status, created_at, updated_at`,
      [
        id,
        dto.user_id ?? null,
        dto.full_name ?? null,
        dto.phone ?? null,
        dto.email ?? null,
        dto.ktp_number ?? null,
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
       RETURNING id, property_id, user_id, full_name, phone, email, ktp_number, gender,
                 resident_status, created_at, updated_at`,
      [id, status, actorUserId],
    );
    if (!result.rows[0]) {
      return null;
    }
    return this.findById(id);
  }

  private async replaceEmergencyContacts(residentId: string, contacts: EmergencyContactDto[]): Promise<void> {
    await this.database.client.query('DELETE FROM resident_emergency_contacts WHERE resident_id = $1', [
      residentId,
    ]);
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
      gender: row.gender,
      residentStatus: row.resident_status,
      emergencyContacts: contactsByResident.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}
