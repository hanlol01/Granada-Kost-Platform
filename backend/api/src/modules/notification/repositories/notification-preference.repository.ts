import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { NotificationPreferenceRecord, UpdateNotificationPreferenceInput } from '../types/notification.types';

type PreferenceRow = {
  id: string;
  user_id: string;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  push_enabled: boolean;
  digest_mode: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class NotificationPreferenceRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByUserId(userId: string): Promise<NotificationPreferenceRecord | null> {
    const result = await this.database.client.query<PreferenceRow>(
      `SELECT ${this.columns()}
       FROM notification_preferences
       WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async upsert(userId: string, input: UpdateNotificationPreferenceInput): Promise<NotificationPreferenceRecord> {
    const result = await this.database.client.query<PreferenceRow>(
      `INSERT INTO notification_preferences (
         user_id, email_enabled, whatsapp_enabled, push_enabled, digest_mode,
         quiet_hours_start, quiet_hours_end
       )
       VALUES (
         $1, COALESCE($2, true), COALESCE($3, false), COALESCE($4, true), COALESCE($5, false),
         $6, $7
       )
       ON CONFLICT (user_id) DO UPDATE
       SET email_enabled = COALESCE($2, notification_preferences.email_enabled),
           whatsapp_enabled = COALESCE($3, notification_preferences.whatsapp_enabled),
           push_enabled = COALESCE($4, notification_preferences.push_enabled),
           digest_mode = COALESCE($5, notification_preferences.digest_mode),
           quiet_hours_start = CASE WHEN $8::boolean THEN $6 ELSE notification_preferences.quiet_hours_start END,
           quiet_hours_end = CASE WHEN $9::boolean THEN $7 ELSE notification_preferences.quiet_hours_end END,
           updated_at = now()
       RETURNING ${this.columns()}`,
      [
        userId,
        input.emailEnabled ?? null,
        input.whatsappEnabled ?? null,
        input.pushEnabled ?? null,
        input.digestMode ?? null,
        input.quietHoursStart ?? null,
        input.quietHoursEnd ?? null,
        Object.prototype.hasOwnProperty.call(input, 'quietHoursStart'),
        Object.prototype.hasOwnProperty.call(input, 'quietHoursEnd'),
      ],
    );
    return this.map(result.rows[0]);
  }

  defaultForUser(userId: string): NotificationPreferenceRecord {
    const now = new Date(0);
    return {
      id: '',
      userId,
      emailEnabled: true,
      whatsappEnabled: false,
      pushEnabled: true,
      digestMode: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private columns(): string {
    return `id, user_id, email_enabled, whatsapp_enabled, push_enabled, digest_mode,
            quiet_hours_start::text AS quiet_hours_start, quiet_hours_end::text AS quiet_hours_end, created_at, updated_at`;
  }

  private map(row: PreferenceRow): NotificationPreferenceRecord {
    return {
      id: row.id,
      userId: row.user_id,
      emailEnabled: row.email_enabled,
      whatsappEnabled: row.whatsapp_enabled,
      pushEnabled: row.push_enabled,
      digestMode: row.digest_mode,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
