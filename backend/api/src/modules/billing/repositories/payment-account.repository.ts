import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';

export type PaymentAccountRecord = {
  id: string;
  propertyId: string;
  accountType: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  instructions: string | null;
  isPrimary: boolean;
  status: 'active' | 'inactive';
};

type PaymentAccountRow = {
  id: string;
  property_id: string;
  account_type: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  instructions: string | null;
  is_primary: boolean;
  status: 'active' | 'inactive';
};

@Injectable()
export class PaymentAccountRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyIds?: string[]): Promise<PaymentAccountRecord[]> {
    const result = await this.database.client.query<PaymentAccountRow>(
      `SELECT id, property_id, account_type, bank_name, account_number, account_holder,
              instructions, is_primary, status
       FROM payment_accounts
       WHERE ($1::uuid[] IS NULL OR property_id = ANY($1::uuid[]))
         AND status = 'active'
       ORDER BY property_id, is_primary DESC, bank_name`,
      [propertyIds?.length ? propertyIds : null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      accountType: row.account_type,
      bankName: row.bank_name,
      accountNumber: row.account_number,
      accountHolder: row.account_holder,
      instructions: row.instructions,
      isPrimary: row.is_primary,
      status: row.status,
    }));
  }
}
