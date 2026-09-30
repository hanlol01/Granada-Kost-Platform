import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from './property.service';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import {
  DOCUMENT_SIGNATORY_ROLES,
  type DocumentSignatoryRole,
  type UpdatePropertyDocumentSignatoryDto,
  UpdatePropertyDocumentSettingsDto,
} from './dto/update-property-document-settings.dto';

type RequestAuditContext = {
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

type OrganizationRow = {
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  updated_at: Date;
};

type PropertyRow = {
  id: string;
  name: string;
};

type SignatoryRow = {
  role_code: DocumentSignatoryRole;
  full_name: string;
  job_title: string;
  signature_file_id: string | null;
  updated_at: Date;
};

type FileRow = {
  id: string;
  property_id: string;
  file_purpose: string;
  is_deleted: boolean;
};

const SIGNATORY_DEFAULTS: Record<
  DocumentSignatoryRole,
  { fullName: string; jobTitle: string }
> = {
  manager: { fullName: '', jobTitle: 'Pengelola' },
  dbo: { fullName: '', jobTitle: 'DBO' },
  director: { fullName: '', jobTitle: 'Direktur' },
};

@Injectable()
export class DocumentSettingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async getOrganization(user: UserAccessContext, propertyId: string) {
    await this.assertAdminScope(user, propertyId);
    const row = await this.requireOrganization();
    return this.organizationResponse(row);
  }

  async updateOrganization(
    user: UserAccessContext,
    propertyId: string,
    dto: UpdateOrganizationSettingsDto,
    context: RequestAuditContext,
  ) {
    await this.assertAdminScope(user, propertyId);
    const companyName = this.requiredText(dto.company_name, 'Nama organisasi wajib diisi.');
    const companyAddress = this.optionalText(dto.company_address);
    const companyPhone = this.optionalText(dto.company_phone);
    const companyEmail = this.optionalText(dto.company_email);

    return this.database.transaction(async (client) => {
      const before = await this.requireOrganization(client, true);
      const result = await client.query<OrganizationRow>(
        `UPDATE organization_settings
         SET company_name=$1,
             company_address=$2,
             company_phone=$3,
             company_email=$4,
             updated_by_user_id=$5,
             updated_at=now()
         WHERE singleton=true
         RETURNING company_name,company_address,company_phone,company_email,updated_at`,
        [companyName, companyAddress, companyPhone, companyEmail, user.id],
      );
      const updated = result.rows[0];
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId,
          action: 'organization_settings.update',
          resourceType: 'organization_settings',
          resourceId: propertyId,
          beforeData: this.organizationAuditData(before),
          afterData: this.organizationAuditData(updated),
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      return this.organizationResponse(updated);
    });
  }

  async getPropertyDocumentSettings(user: UserAccessContext, propertyId: string) {
    await this.assertAdminScope(user, propertyId);
    const property = await this.requireProperty(propertyId);
    const signatories = await this.findSignatories(propertyId);
    return this.documentSettingsResponse(property, signatories);
  }

  async updatePropertyDocumentSettings(
    user: UserAccessContext,
    propertyId: string,
    dto: UpdatePropertyDocumentSettingsDto,
    context: RequestAuditContext,
  ) {
    await this.assertAdminScope(user, propertyId);
    const propertyName = this.requiredText(dto.property_name, 'Nama properti wajib diisi.');
    const signatories = this.normalizeSignatories(dto.signatories);

    return this.database.transaction(async (client) => {
      const beforeProperty = await this.requireProperty(propertyId, client, true);
      const beforeSignatories = await this.findSignatories(propertyId, client, true);
      await this.assertSignatureFiles(user, propertyId, signatories, client);

      const propertyResult = await client.query<PropertyRow>(
        `UPDATE properties
         SET name=$2,updated_by_user_id=$3,updated_at=now()
         WHERE id=$1
         RETURNING id,name`,
        [propertyId, propertyName, user.id],
      );
      const updatedProperty = propertyResult.rows[0];
      if (!updatedProperty) {
        throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'Properti tidak ditemukan.' });
      }

      for (const signatory of signatories) {
        await client.query(
          `INSERT INTO property_document_signatories (
             property_id,role_code,full_name,job_title,signature_file_id,updated_by_user_id
           )
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (property_id,role_code) DO UPDATE
           SET full_name=EXCLUDED.full_name,
               job_title=EXCLUDED.job_title,
               signature_file_id=EXCLUDED.signature_file_id,
               updated_by_user_id=EXCLUDED.updated_by_user_id,
               updated_at=now()`,
          [
            propertyId,
            signatory.role,
            signatory.full_name,
            signatory.job_title,
            signatory.signature_file_id,
            user.id,
          ],
        );
      }

      const updatedSignatories = await this.findSignatories(propertyId, client, true);
      const activeSignatureIds = new Set(
        updatedSignatories
          .map((signatory) => signatory.signature_file_id)
          .filter((fileId): fileId is string => Boolean(fileId)),
      );
      const replacedSignatureIds = beforeSignatories
        .map((signatory) => signatory.signature_file_id)
        .filter((fileId): fileId is string => fileId !== null)
        .filter((fileId) => !activeSignatureIds.has(fileId));
      if (replacedSignatureIds.length) {
        await client.query(
          `UPDATE files
           SET is_deleted=true,deleted_at=now(),deleted_by_user_id=$2,updated_at=now()
           WHERE id=ANY($1::uuid[]) AND is_deleted=false`,
          [replacedSignatureIds, user.id],
        );
      }

      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId,
          action: 'property_document_settings.update',
          resourceType: 'property_document_settings',
          resourceId: propertyId,
          beforeData: this.documentAuditData(beforeProperty, beforeSignatories),
          afterData: this.documentAuditData(updatedProperty, updatedSignatories),
          resultStatus: 'success',
          ...context,
        },
        client,
      );

      return this.documentSettingsResponse(updatedProperty, updatedSignatories);
    });
  }

  private async assertAdminScope(user: UserAccessContext, propertyId: string): Promise<void> {
    if (!user.roles.includes('admin')) {
      throw new ForbiddenException({
        code: 'GENERAL_SETTINGS_ADMIN_ONLY',
        message: 'Pengaturan Umum hanya dapat dikelola oleh Admin.',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }

  private async requireOrganization(client?: PoolClient, lockForUpdate = false): Promise<OrganizationRow> {
    const executor = client ?? this.database.client;
    await executor.query(
      `INSERT INTO organization_settings (singleton)
       VALUES (true)
       ON CONFLICT (singleton) DO NOTHING`,
    );
    const lock = lockForUpdate ? ' FOR UPDATE' : '';
    const result = await executor.query<OrganizationRow>(
      `SELECT company_name,company_address,company_phone,company_email,updated_at
       FROM organization_settings
       WHERE singleton=true${lock}`,
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException({ code: 'ORGANIZATION_SETTINGS_NOT_FOUND', message: 'Pengaturan organisasi tidak tersedia.' });
    }
    return row;
  }

  private async requireProperty(
    propertyId: string,
    client?: PoolClient,
    lockForUpdate = false,
  ): Promise<PropertyRow> {
    const lock = lockForUpdate ? ' FOR UPDATE' : '';
    const result = await (client ?? this.database.client).query<PropertyRow>(
      `SELECT id,name FROM properties WHERE id=$1${lock}`,
      [propertyId],
    );
    const property = result.rows[0];
    if (!property) {
      throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'Properti tidak ditemukan.' });
    }
    return property;
  }

  private async findSignatories(
    propertyId: string,
    client?: PoolClient,
    lockForUpdate = false,
  ): Promise<SignatoryRow[]> {
    const lock = lockForUpdate ? ' FOR UPDATE' : '';
    const result = await (client ?? this.database.client).query<SignatoryRow>(
      `SELECT role_code,full_name,job_title,signature_file_id,updated_at
       FROM property_document_signatories
       WHERE property_id=$1
       ORDER BY role_code${lock}`,
      [propertyId],
    );
    const existing = new Map(result.rows.map((row) => [row.role_code, row]));
    return DOCUMENT_SIGNATORY_ROLES.map((role) =>
      existing.get(role) ?? {
        role_code: role,
        full_name: SIGNATORY_DEFAULTS[role].fullName,
        job_title: SIGNATORY_DEFAULTS[role].jobTitle,
        signature_file_id: null,
        updated_at: new Date(0),
      },
    );
  }

  private normalizeSignatories(values: UpdatePropertyDocumentSignatoryDto[]) {
    const byRole = new Map<DocumentSignatoryRole, UpdatePropertyDocumentSignatoryDto>();
    for (const signatory of values) {
      if (byRole.has(signatory.role)) {
        throw new BadRequestException({ code: 'DOCUMENT_SIGNATORY_DUPLICATE', message: 'Setiap peran penandatangan hanya boleh diisi satu kali.' });
      }
      byRole.set(signatory.role, signatory);
    }
    if (byRole.size !== DOCUMENT_SIGNATORY_ROLES.length) {
      throw new BadRequestException({ code: 'DOCUMENT_SIGNATORY_INCOMPLETE', message: 'Pengelola, DBO, dan Direktur harus tersedia pada Pengaturan Umum.' });
    }

    const normalized = DOCUMENT_SIGNATORY_ROLES.map((role) => {
      const signatory = byRole.get(role)!;
      return {
        role,
        full_name: signatory.full_name.trim(),
        job_title: signatory.job_title.trim(),
        signature_file_id: signatory.signature_file_id ?? null,
      };
    });
    const fileIds = normalized
      .map((signatory) => signatory.signature_file_id)
      .filter((fileId): fileId is string => Boolean(fileId));
    if (new Set(fileIds).size !== fileIds.length) {
      throw new BadRequestException({ code: 'DOCUMENT_SIGNATURE_REUSED', message: 'Satu gambar tanda tangan hanya dapat dipakai untuk satu peran.' });
    }
    return normalized;
  }

  private async assertSignatureFiles(
    user: UserAccessContext,
    propertyId: string,
    signatories: Array<{ signature_file_id: string | null }>,
    client: PoolClient,
  ): Promise<void> {
    const ids = signatories
      .map((signatory) => signatory.signature_file_id)
      .filter((fileId): fileId is string => Boolean(fileId));
    if (!ids.length) return;
    const result = await client.query<FileRow>(
      `SELECT id,property_id,file_purpose,is_deleted
       FROM files
       WHERE id=ANY($1::uuid[])
       FOR UPDATE`,
      [ids],
    );
    if (
      result.rows.length !== ids.length ||
      result.rows.some(
        (file) =>
          file.property_id !== propertyId ||
          file.file_purpose !== 'document_signature' ||
          file.is_deleted,
      )
    ) {
      throw new BadRequestException({
        code: 'DOCUMENT_SIGNATURE_INVALID',
        message: 'Gambar tanda tangan harus berupa unggahan aktif untuk properti yang sama.',
      });
    }
    if (!user.roles.includes('admin')) {
      throw new ForbiddenException({
        code: 'DOCUMENT_SIGNATURE_ADMIN_ONLY',
        message: 'Tanda tangan dokumen hanya dapat diatur oleh Admin.',
      });
    }
  }

  private organizationResponse(row: OrganizationRow) {
    return {
      companyName: row.company_name,
      companyAddress: row.company_address,
      companyPhone: row.company_phone,
      companyEmail: row.company_email,
      updatedAt: row.updated_at,
    };
  }

  private documentSettingsResponse(property: PropertyRow, signatories: SignatoryRow[]) {
    return {
      propertyId: property.id,
      propertyName: property.name,
      signatories: signatories.map((signatory) => ({
        role: signatory.role_code,
        fullName: signatory.full_name,
        jobTitle: signatory.job_title,
        signatureFileId: signatory.signature_file_id,
        updatedAt: signatory.updated_at,
      })),
    };
  }

  private organizationAuditData(row: OrganizationRow) {
    return {
      companyName: row.company_name,
      companyAddress: row.company_address,
      companyPhone: row.company_phone,
      companyEmail: row.company_email,
    };
  }

  private documentAuditData(property: PropertyRow, signatories: SignatoryRow[]) {
    return {
      propertyName: property.name,
      signatories: signatories.map((signatory) => ({
        role: signatory.role_code,
        fullName: signatory.full_name,
        jobTitle: signatory.job_title,
        signatureFileId: signatory.signature_file_id,
      })),
    };
  }

  private requiredText(value: string, message: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException({ code: 'GENERAL_SETTINGS_REQUIRED', message });
    return normalized;
  }

  private optionalText(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }
}
