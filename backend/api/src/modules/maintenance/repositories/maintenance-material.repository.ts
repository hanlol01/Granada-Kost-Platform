import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateMaintenanceMaterialInput, MaintenanceMaterialRecord } from '../types/maintenance.types';

type MaintenanceMaterialRow = {
  id: string;
  work_order_id: string;
  item_name: string;
  quantity: string;
  unit_cost: string;
  total_cost: string;
  created_by_user_id: string | null;
  created_at: Date;
};

@Injectable()
export class MaintenanceMaterialRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(workOrderId: string): Promise<MaintenanceMaterialRecord[]> {
    const result = await this.database.client.query<MaintenanceMaterialRow>(
      `SELECT id, work_order_id, item_name, quantity::text, unit_cost, total_cost, created_by_user_id, created_at
       FROM maintenance_materials
       WHERE work_order_id = $1
       ORDER BY created_at ASC`,
      [workOrderId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async add(input: CreateMaintenanceMaterialInput): Promise<MaintenanceMaterialRecord> {
    const quantity = input.quantity ?? '1';
    const unitCost = input.unitCost ?? 0;
    const totalCost = input.totalCost ?? Math.round(Number(quantity) * unitCost);
    const result = await this.database.client.query<MaintenanceMaterialRow>(
      `INSERT INTO maintenance_materials (
         work_order_id, item_name, quantity, unit_cost, total_cost, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, work_order_id, item_name, quantity::text, unit_cost, total_cost, created_by_user_id, created_at`,
      [input.workOrderId, input.itemName, quantity, unitCost, totalCost, input.createdByUserId ?? null],
    );
    return this.map(result.rows[0]);
  }

  private map(row: MaintenanceMaterialRow): MaintenanceMaterialRecord {
    return {
      id: row.id,
      workOrderId: row.work_order_id,
      itemName: row.item_name,
      quantity: row.quantity,
      unitCost: Number(row.unit_cost),
      totalCost: Number(row.total_cost),
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
    };
  }
}
