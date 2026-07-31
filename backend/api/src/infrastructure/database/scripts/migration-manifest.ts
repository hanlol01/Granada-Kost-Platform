export type MigrationManifestEntry = {
  version: string;
  checksumSha256: string;
  sentinels: readonly string[];
};

export const MIGRATION_MANIFEST: readonly MigrationManifestEntry[] = [
  {
    version: '001_iam_rbac.sql',
    checksumSha256: '8acbb127b2fa34df0bb7beaffdbd95b34b1561a9a920d8afbc1fd2e19368b568',
    sentinels: [
      "to_regclass('public.users') IS NOT NULL",
      "to_regclass('public.user_property_roles') IS NOT NULL",
      "to_regclass('public.auth_audit_logs') IS NOT NULL",
    ],
  },
  {
    version: '002_property_room.sql',
    checksumSha256: '9785a1d6574146c98a11e3a74855e951dd782773b08ea53d7d4b4af652776d03',
    sentinels: [
      "to_regclass('public.properties') IS NOT NULL",
      "to_regclass('public.rooms') IS NOT NULL",
      "to_regclass('public.audit_logs') IS NOT NULL",
    ],
  },
  {
    version: '003_resident_occupancy.sql',
    checksumSha256: '0c4e7d7e8310bfbe7b45d125681cf2632626297318cfe4c827b433cf9cd32bad',
    sentinels: [
      "to_regclass('public.residents') IS NOT NULL",
      "to_regclass('public.occupancies') IS NOT NULL",
      "to_regclass('public.check_out_requests') IS NOT NULL",
    ],
  },
  {
    version: '004_room_master_data_alignment.sql',
    checksumSha256: '968efc8cb6b855b65d32aee8726d146a5b36ab8a7bfd09eb7277110fd1f2166f',
    sentinels: [
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'gender_policy')",
      "to_regclass('public.idx_rooms_property_unit_code') IS NOT NULL",
    ],
  },
  {
    version: '005_billing.sql',
    checksumSha256: '8f413a0675fbdece4f920f55edd96b172685e9e25e031d521a558f2b5497aee8',
    sentinels: [
      "to_regclass('public.invoices') IS NOT NULL",
      "to_regclass('public.payments') IS NOT NULL",
      "to_regclass('public.payment_allocations') IS NOT NULL",
    ],
  },
  {
    version: '006_complaint_maintenance.sql',
    checksumSha256: 'f5fb2afd8eb90c73111cbd69761f73ab23a6f334df1fdb59632e2d222a78766e',
    sentinels: [
      "to_regclass('public.complaints') IS NOT NULL",
      "to_regclass('public.technician_profiles') IS NOT NULL",
      "to_regclass('public.maintenance_work_orders') IS NOT NULL",
    ],
  },
  {
    version: '007_vehicle_management.sql',
    checksumSha256: '1e54ec9f0db9157c4ee1a3ba8edee43672a5c8918d3fc0dcf895d2e2f25e6f48',
    sentinels: [
      "to_regclass('public.vehicles') IS NOT NULL",
      "to_regclass('public.parking_zones') IS NOT NULL",
      "to_regclass('public.parking_slots') IS NOT NULL",
    ],
  },
  {
    version: '008_notification.sql',
    checksumSha256: '3885a8a354c5d93c504bf03a2564461029867ff61810fa26781647aec6f3e7e6',
    sentinels: [
      "to_regclass('public.notification_preferences') IS NOT NULL",
      "to_regclass('public.notifications') IS NOT NULL",
      "to_regclass('public.notification_deliveries') IS NOT NULL",
    ],
  },
  {
    version: '009_smart_lock.sql',
    checksumSha256: '36dea23ce22684141f81eef7cde23ac5ecefd7a3e5d10a6bc5ff92af9c8b39eb',
    sentinels: [
      "to_regclass('public.smart_lock_devices') IS NOT NULL",
      "to_regclass('public.smart_lock_access_grants') IS NOT NULL",
      "to_regclass('public.smart_lock_access_logs') IS NOT NULL",
    ],
  },
  {
    version: '010_smart_lock_runtime.sql',
    checksumSha256: '642ba766124637e4a7cbe04c000942ed8f67add46adda5d362e822f72bd215c6',
    sentinels: [
      "to_regclass('public.smart_lock_gateways') IS NOT NULL",
      "to_regclass('public.smart_lock_gateway_credentials') IS NOT NULL",
      "to_regclass('public.smart_lock_device_gateways') IS NOT NULL",
    ],
  },
  {
    version: '011_files.sql',
    checksumSha256: 'd35a1ece34cad91e0bbafe8c2ef312188b3e6c373dcda23fc97c8736d57e3613',
    sentinels: [
      "to_regclass('public.files') IS NOT NULL",
      "to_regclass('public.idx_files_property_purpose_created') IS NOT NULL",
    ],
  },
  {
    version: '012_payment_gateway.sql',
    checksumSha256: '26b5d6187860f2e6667b75d7c5ce5abc24c84afe8b66d89ca095b8331239659f',
    sentinels: [
      "to_regclass('public.payment_transactions') IS NOT NULL",
      "to_regclass('public.payment_webhook_events') IS NOT NULL",
      "to_regclass('public.idx_payment_transactions_invoice_active_unique') IS NOT NULL",
    ],
  },
  {
    version: '013_room_inventory.sql',
    checksumSha256: 'befda5b5dff7b0581e9a29bc3bc4552d6b260db7c9e9f2cf3f956771fc538ab7',
    sentinels: [
      "to_regclass('public.room_buildings') IS NOT NULL",
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'building_id')",
      "to_regclass('public.idx_rooms_property_room_code_unique') IS NOT NULL",
    ],
  },
  {
    version: '014_booking_leads.sql',
    checksumSha256: '21972c249b4cf7f12f44023549dbd109f632364315a97e650c6d7e615436bda0',
    sentinels: [
      "to_regclass('public.booking_leads') IS NOT NULL",
      "to_regclass('public.idx_booking_leads_public_group_key') IS NOT NULL",
    ],
  },
  {
    version: '015_hunian_gallery.sql',
    checksumSha256: '575dd339cafd2a2614aa3c5709cb9dcef322552a8fe888e0b9fdcb3704343f7f',
    sentinels: [
      "to_regclass('public.hunian_gallery_images') IS NOT NULL",
      "to_regclass('public.idx_hunian_gallery_single_cover') IS NOT NULL",
    ],
  },
  {
    version: '016_kost_type_revision.sql',
    checksumSha256: 'f1fa55a818b589794ff8d5a1e264037c2fa5ecb47da4b919eb4764c7a229ea44',
    sentinels: [
      "to_regclass('public.kost_types') IS NOT NULL",
      "to_regclass('public.kost_type_rules') IS NOT NULL",
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'kost_type_id')",
    ],
  },
  {
    version: '017_lease_system.sql',
    checksumSha256: '59ce6fc25b37ec016d383eacc04dc6bb1c932b5b403fa832ed8f92170c0b094f',
    sentinels: [
      "to_regclass('public.leases') IS NOT NULL",
      "to_regclass('public.business_events') IS NOT NULL",
      "to_regclass('public.idempotency_commands') IS NOT NULL",
    ],
  },
  {
    version: '018_lease_m6_runtime.sql',
    checksumSha256: 'ec88959272c0cde3b57d02b2aa86df274b0557a7e706197bdce4d0f4cc2d7dca',
    sentinels: [
      "to_regclass('public.property_feature_flags') IS NOT NULL",
      "to_regclass('public.idx_property_feature_flags_scheduler_enabled') IS NOT NULL",
    ],
  },
  {
    version: '019_booking_lead_admin_quick_entry.sql',
    checksumSha256: '6a4b0299e1fb65a894a1354b9f9e0cf99bf90fb51bde6ac1424a01d38c8d6dc4',
    sentinels: [
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'booking_leads' AND column_name = 'visitor_address')",
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'booking_leads' AND column_name = 'created_by_user_id')",
      "to_regclass('public.idx_booking_leads_admin_duplicate') IS NOT NULL",
    ],
  },
  {
    version: '020_booking_lead_room_holds.sql',
    checksumSha256: '095c4a55d23afe4baaa930080d3d5358bc08e83da7eb1dbe0b095e65e739f5e4',
    sentinels: [
      "to_regclass('public.booking_lead_holds') IS NOT NULL",
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'property_feature_flags' AND column_name = 'booking_hold_write')",
      "to_regclass('public.uq_booking_lead_holds_active_room') IS NOT NULL",
    ],
  },
  {
    version: '021_schema_migration_ledger.sql',
    checksumSha256: 'b69e8d184f6af5bcde536887c71063629cd9d465bce4cfef1873d3da446242b8',
    sentinels: ["to_regclass('public.schema_migrations') IS NOT NULL"],
  },
  {
    version: '022_kost_type_commercial_authority.sql',
    checksumSha256: 'bdcfba52722d697a161549c297871e31f9d25eee390964570b95e1d113471b7e',
    sentinels: [
      "to_regclass('public.kost_type_commercial_versions') IS NOT NULL",
      "to_regclass('public.idx_kost_type_commercial_versions_effective') IS NOT NULL",
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kost_type_commercial_versions' AND column_name = 'payment_schedules')",
    ],
  },
  {
    version: '023_category_content_publication.sql',
    checksumSha256: '2a5b314f24fea2c7cff4bc9c532646da71a0145071d2627b31dceddb5ce41bcb',
    sentinels: [
      "to_regclass('public.kost_type_content_facilities') IS NOT NULL",
      "to_regclass('public.kost_type_content_versions') IS NOT NULL",
      "to_regclass('public.property_policy_documents') IS NOT NULL",
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'hunian_gallery_images' AND column_name = 'public_derivative_file_id')",
    ],
  },
  {
    version: '024_public_booking_lead_contact.sql',
    checksumSha256: 'c06b64fd7a242b59b1e9d6978a769dbbf526ff9854112723adaffcbcbd483d00',
    sentinels: [
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'booking_leads' AND column_name = 'visitor_email')",
      "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'booking_leads' AND column_name = 'consent_at')",
      "to_regclass('public.idx_booking_leads_public_email_created') IS NOT NULL",
    ],
  },
] as const;
