import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateVehicleFileInput,
  VehicleFilePurpose,
  VehicleFileRecord,
} from '../types/vehicle.types';

type VehicleFileRow = {
  id: string;
  vehicle_id: string;
  file_id: string;
  file_purpose: VehicleFilePurpose;
  uploaded_by_user_id: string | null;
  caption: string | null;
  issued_at: string | null;
  valid_until: string | null;
  created_at: Date;
};

@Injectable()
export class VehicleFileRepository {
  constructor(private readonly database: DatabaseService) {}

  async attach(input: CreateVehicleFileInput): Promise<VehicleFileRecord> {
    const result = await this.database.client.query<VehicleFileRow>(
      `INSERT INTO vehicle_files (vehicle_id, file_id, file_purpose, uploaded_by_user_id, caption, issued_at, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date)
       ON CONFLICT (vehicle_id, file_id) DO UPDATE
       SET file_purpose = EXCLUDED.file_purpose,
           uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
           caption = EXCLUDED.caption,
           issued_at = EXCLUDED.issued_at,
           valid_until = EXCLUDED.valid_until
       RETURNING id, vehicle_id, file_id, file_purpose, uploaded_by_user_id, caption, issued_at, valid_until, created_at`,
      [
        input.vehicleId,
        input.fileId,
        input.filePurpose ?? 'vehicle_photo',
        input.uploadedByUserId ?? null,
        input.caption ?? null,
        input.issuedAt ?? null,
        input.validUntil ?? null,
      ],
    );
    return this.map(result.rows[0]);
  }

  async list(vehicleId: string): Promise<VehicleFileRecord[]> {
    const result = await this.database.client.query<VehicleFileRow>(
      `SELECT id, vehicle_id, file_id, file_purpose, uploaded_by_user_id, caption, issued_at, valid_until, created_at
       FROM vehicle_files
       WHERE vehicle_id = $1
       ORDER BY created_at DESC`,
      [vehicleId],
    );
    return result.rows.map((row) => this.map(row));
  }

  private map(row: VehicleFileRow): VehicleFileRecord {
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      fileId: row.file_id,
      filePurpose: row.file_purpose,
      uploadedByUserId: row.uploaded_by_user_id,
      caption: row.caption,
      issuedAt: row.issued_at,
      validUntil: row.valid_until,
      createdAt: row.created_at,
    };
  }
}
