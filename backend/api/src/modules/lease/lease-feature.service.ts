import { ForbiddenException, Injectable } from '@nestjs/common';
import { LeaseRepository } from './lease.repository';

type QueryClient = {
  query<T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
};

type FeatureFlagRow = {
  property_id: string;
  admin_ux_read: boolean;
  lease_write: boolean;
  lease_transfer: boolean;
  lease_billing_scheduler: boolean;
};

/**
 * M6 flags are deliberately deny-by-default. The table has no migration
 * backfill, so an absent row is indistinguishable from all flags being false.
 */
@Injectable()
export class LeaseFeatureService {
  constructor(private readonly leases: LeaseRepository) {}

  async assertWriteEnabled(propertyId: string, client?: QueryClient): Promise<void> {
    const flags = await this.readFlags(propertyId, client, Boolean(client));
    if (!flags.admin_ux_read || !flags.lease_write) {
      throw new ForbiddenException({
        code: 'LEASE_WRITE_DISABLED',
        message: 'Lease creation is not enabled for this property',
      });
    }
  }

  async assertTransferEnabled(propertyId: string, client?: QueryClient): Promise<void> {
    const flags = await this.readFlags(propertyId, client, Boolean(client));
    if (!flags.admin_ux_read || !flags.lease_write || !flags.lease_transfer) {
      throw new ForbiddenException({
        code: 'LEASE_TRANSFER_DISABLED',
        message: 'Lease transfer is not enabled for this property',
      });
    }
  }

  async schedulerEnabledPropertyIds(client?: QueryClient): Promise<string[]> {
    const queryable: QueryClient = client ?? this.leases;
    const result = await queryable.query<{ property_id: string }>(
      `SELECT property_id
       FROM property_feature_flags
       WHERE admin_ux_read = true
         AND lease_write = true
         AND lease_transfer = true
         AND lease_billing_scheduler = true
       ORDER BY property_id`,
    );
    return result.rows.map((row) => row.property_id);
  }

  async isSchedulerEnabled(propertyId: string, client?: QueryClient): Promise<boolean> {
    const flags = await this.readFlags(propertyId, client, Boolean(client));
    return (
      flags.admin_ux_read &&
      flags.lease_write &&
      flags.lease_transfer &&
      flags.lease_billing_scheduler
    );
  }

  private async readFlags(
    propertyId: string,
    client?: QueryClient,
    lock = false,
  ): Promise<FeatureFlagRow> {
    const queryable: QueryClient = client ?? this.leases;
    const result = await queryable.query<FeatureFlagRow>(
      `SELECT property_id, admin_ux_read, lease_write, lease_transfer, lease_billing_scheduler
       FROM property_feature_flags
       WHERE property_id = $1${lock ? ' FOR SHARE' : ''}`,
      [propertyId],
    );
    return (
      result.rows[0] ?? {
        property_id: propertyId,
        admin_ux_read: false,
        lease_write: false,
        lease_transfer: false,
        lease_billing_scheduler: false,
      }
    );
  }
}
