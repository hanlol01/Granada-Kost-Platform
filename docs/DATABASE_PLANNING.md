# DATABASE PLANNING - Granada Kost Platform

> Versi: 1.0  
> Tanggal: 15 Juni 2026  
> Peran Pembuat: Principal Database Architect / PostgreSQL Specialist  
> Status: Draft arsitektur database, belum berisi migration, SQL, Prisma, atau TypeORM

---

# Executive Summary

Dokumen ini menerjemahkan `docs/DOMAIN_MODEL.md`, audit frontend Admin, dan audit frontend Penghuni menjadi rencana database PostgreSQL tingkat arsitektur untuk Granada Kost Platform.

Keputusan bisnis final yang menjadi dasar desain:

- Satu kamar hanya boleh memiliki satu penghuni aktif pada satu waktu.
- Role sistem adalah Owner platform, Manager, Admin, Teknisi, Penghuni, dan Pemilik Rumah Kost / Property Investor.
- Pemilik Rumah Kost adalah investor property, bukan owner platform; aksesnya read-only dan hanya untuk property miliknya.
- Admin menginput penghuni baru secara manual; booking online publik belum diperlukan.
- Penghuni dapat mengajukan perpanjangan sewa sendiri.
- Deposit wajib menjadi domain bisnis: dibayar saat check-in dan dapat dikembalikan saat check-out.
- Check-out wajib memiliki workflow formal.
- Smart Lock dan CCTV adalah bounded context terpisah.
- Stack target: NestJS, PostgreSQL, Redis.

Prinsip utama rencana ini adalah menyiapkan database yang cukup kuat untuk Phase 1 tanpa membebani implementasi awal dengan fitur publik yang belum diperlukan. Karena itu, Phase 1 memprioritaskan operasional inti kost: property, room, penghuni, occupancy/lease, check-in/check-out, deposit, billing, payment, complaint, maintenance dasar, IAM/RBAC, notification, file metadata, dan audit. Smart Lock serta CCTV tetap dibuat sebagai bounded context tersendiri, minimal pada level metadata, audit, dan access-control agar API planning tidak perlu membongkar ulang struktur inti.

Ringkasan rekomendasi phase:

| Area | Phase 1 - Wajib | Phase 2 - Bisa Ditunda |
|---|---|---|
| Core kost | properties, rooms, room_types, room_facilities, residents, occupancies, leases, lease_extension_requests | multi-property switch UI, advanced room pricing history |
| Check-in/out | check_in_records, check_out_requests, check_out_inspections, check_out_tasks | digital handover form, digital signature |
| Deposit | deposits, deposit_transactions, deposit_deductions, deposit_refunds | automated refund disbursement integration |
| Billing | invoices, invoice_line_items, payments, payment_allocations | payment gateway callbacks, recurring auto-generate tuning |
| Maintenance/complaint | complaints, complaint_status_histories, technicians/basic user assignment, maintenance_work_orders | SLA engine, preventive maintenance scheduling |
| Smart Lock | smart_lock_devices, smart_lock_access_logs, smart_lock_restrictions, smart_lock_alerts | vendor command queue, full Tuya telemetry archive |
| CCTV | cameras, camera_preview_sessions, camera_access_logs | motion events, snapshot archive, stream health analytics |
| Booking | internal resident intake fields only | public bookings, booking_fee_payments, public booking expiry flow |
| Communication | announcements, kost_rules, faqs, notifications | full chat management and broadcast segmentation |
| IAM/RBAC | users, roles, permissions, user_property_roles, property_investor_assignments, sessions/refresh tokens | complex custom role builder |

---

# Database Design Principles

1. PostgreSQL is the system of record.
   Redis may be used for cache, queues, rate limit counters, idempotency windows, and ephemeral device/session state, but PostgreSQL remains authoritative for business records.

2. Business lifecycle is stored explicitly.
   Room status, resident status, lease status, invoice status, deposit status, complaint status, check-out status, smart lock state, and camera state must be represented as explicit fields with history where the workflow matters.

3. One room = one active penghuni is enforced at database level.
   The application should validate early, but PostgreSQL must enforce uniqueness for active occupancy per room and per resident.

4. Financial records are append-friendly.
   Invoices, payments, deposit transactions, deductions, refunds, and payment allocations should not be overwritten casually. Corrections should create adjustment records or audit trails.

5. Bounded contexts are separated by table ownership.
   Smart Lock and CCTV have their own tables, logs, and retention rules. They may reference `rooms`, `properties`, and `users`, but their operational logs should not be collapsed into a generic table only.

6. Multi-property readiness is mandatory from day one.
   The current business starts with one property, but operational tables should include `property_id` where the entity belongs to a physical kost.

7. Auditability is designed before convenience.
   Sensitive operations include payment changes, deposit changes, check-in/check-out, smart lock actions, CCTV preview, resident data updates, RBAC changes, and file access.

8. PII is minimized and protected.
   KTP, phone, email, emergency contacts, and identity files require clear ownership, audit trail, and retention policy. Avoid duplicating PII into logs where a foreign key is sufficient.

9. UI mock duplication must be consolidated.
   Admin has separate `rooms` and `bookingRooms`; backend should use one `rooms` table with floor, size, photo, base price, deposit policy, facilities, and status.

10. Phase 1 favors normalized operational tables.
    JSONB is allowed for provider payloads, metadata, and flexible event details, but core business fields should remain queryable columns.

---

# Naming Convention

Recommended naming style:

| Item | Convention | Example |
|---|---|---|
| Tables | English, plural, snake_case | `rooms`, `smart_lock_devices` |
| Primary key | `id` as UUID | `id` |
| Foreign key | Singular table name + `_id` | `room_id`, `resident_id` |
| Timestamps | `created_at`, `updated_at`, `deleted_at` | `created_at` |
| Actor columns | `created_by_user_id`, `updated_by_user_id`, `deleted_by_user_id` | `updated_by_user_id` |
| Status columns | explicit status name | `invoice_status`, `lease_status` |
| Money columns | integer minor unit or numeric decimal, consistently chosen | `amount`, `deposit_amount` |
| Date-only columns | suffix `_date` | `due_date`, `check_in_date` |
| Timestamp columns | suffix `_at` | `paid_at`, `expired_at` |
| External IDs | provider prefix | `tuya_device_id`, `nvr_camera_id` |
| Human codes | `code` with scoped uniqueness | `INV-2026-0001`, `TKT-2026-0001` |
| Metadata | `metadata` JSONB | `provider_payload`, `metadata` |

Recommended enum naming:

- Use lowercase snake_case values in database-facing contracts.
- Keep UI labels outside database enum values.
- Examples: `vacant`, `occupied`, `maintenance`, `reserved`, `active`, `inactive`, `pending`, `paid`, `overdue`, `refunded`.

Recommended money strategy:

- Prefer integer minor unit in Indonesian Rupiah because IDR has no commonly used fractional cent. Example: `amount` stores `1850000`.
- If later supporting multi-currency or fractional fees, move to `numeric(18,2)` consistently. Do not mix strategies per table.

---

# Multi Property Readiness

Granada starts as one property, but database structure should be ready for more properties.

Rules:

- `properties` is the top-level ownership boundary for physical kost operations.
- Every operational table that belongs to a property must include `property_id`.
- Tables that are globally shared, such as `roles`, `permissions`, and global provider catalogs, may omit `property_id`.
- User access to a property is not inferred only from role. Use `user_property_roles` so one user can be Owner platform/Manager/Admin/Teknisi/Pemilik Rumah Kost for one or more properties later.
- Property investor ownership is a business relationship, not only a permission. Use `property_investor_assignments` to link one investor user to one or more properties that they own, then use RBAC to grant read-only access.
- The technical role code for Pemilik Rumah Kost may be `property_owner` or `property_investor`; this planning recommends `property_investor` to avoid confusion with Owner platform. The UI label must be "Pemilik Rumah Kost".
- Uniqueness is scoped by property for physical identifiers:
  - room number unique per property.
  - camera code/name unique per property.
  - smart lock device assignment unique per room.
  - invoice code unique per property and year.
  - complaint code unique per property and year.

Minimum multi-property columns:

| Table group | Required property strategy |
|---|---|
| Core rooms/residents/leases | `property_id` required |
| Billing/deposit/payment | `property_id` required |
| Complaint/maintenance | `property_id` required |
| Notification | `property_id` nullable only for platform-level messages |
| Smart Lock | `property_id` required via device and access logs |
| CCTV | `property_id` required via camera and access logs |
| File management | `property_id` nullable, but required for property-owned files |
| Audit logs | `property_id` nullable for global auth events, required for property operations |

---

# Core Tables

Core tables are the minimum business backbone for room, penghuni, occupancy, lease, and property operations.

## Phase 1 Core Tables

| Table | Purpose | Key fields |
|---|---|---|
| `properties` | Data kost/property fisik | `id`, `name`, `address`, `phone`, `email`, `logo_file_id`, `timezone`, `status` |
| `property_settings` | Konfigurasi bisnis per property | `property_id`, `default_due_day`, `late_fee_percent_per_day`, `booking_fee_amount`, `quiet_hour_start`, `guest_report_deadline` |
| `property_investor_assignments` | Relasi bisnis Pemilik Rumah Kost ke property miliknya | `property_id`, `user_id`, `ownership_label`, `ownership_status`, `effective_from`, `effective_until`, `assigned_by_user_id` |
| `room_types` | Master tipe kamar | `property_id`, `name`, `base_price`, `default_deposit_amount`, `description`, `status` |
| `room_facilities` | Master fasilitas | `property_id`, `name`, `status` |
| `rooms` | Unit kamar yang dapat dihuni | `property_id`, `room_type_id`, `number`, `floor`, `size_label`, `monthly_price`, `deposit_amount`, `room_status`, `primary_photo_file_id` |
| `room_facility_assignments` | Relasi many-to-many room dan fasilitas | `room_id`, `facility_id` |
| `residents` | Profil penghuni | `property_id`, `user_id`, `full_name`, `phone`, `email`, `ktp_number`, `gender`, `emergency_contact`, `resident_status` |
| `occupancies` | Catatan penghuni menempati kamar | `property_id`, `room_id`, `resident_id`, `lease_id`, `start_date`, `end_date`, `occupancy_status` |
| `leases` | Kontrak/sewa operasional | `property_id`, `resident_id`, `room_id`, `lease_code`, `start_date`, `end_date`, `duration_months`, `monthly_price`, `lease_status` |
| `lease_extension_requests` | Pengajuan perpanjangan sewa oleh penghuni | `property_id`, `lease_id`, `resident_id`, `requested_months`, `requested_end_date`, `request_status`, `requested_at`, `reviewed_by_user_id` |
| `check_in_records` | Bukti dan workflow check-in | `property_id`, `lease_id`, `resident_id`, `room_id`, `checked_in_at`, `deposit_id`, `handled_by_user_id`, `notes` |
| `check_out_requests` | Workflow awal check-out | `property_id`, `lease_id`, `resident_id`, `room_id`, `requested_check_out_date`, `reason`, `check_out_status`, `requested_by_user_id` |
| `check_out_inspections` | Inspeksi kamar saat keluar | `property_id`, `check_out_request_id`, `inspected_by_user_id`, `inspection_at`, `room_condition_status`, `notes` |
| `check_out_tasks` | Checklist operasional check-out | `property_id`, `check_out_request_id`, `task_type`, `task_status`, `assigned_to_user_id`, `completed_at` |

## Core Business Rules Enforced by Design

- A room can have at most one active occupancy.
- A resident can have at most one active occupancy in the same property unless a future policy explicitly allows multiple rooms.
- A lease belongs to exactly one resident and one room.
- A lease extension request belongs to an active or soon-to-expire lease.
- Check-out closes the active occupancy, ends or terminates the lease, triggers deposit settlement, and disables smart lock access for the resident.
- Room status should be derived or synchronized through workflow rules, not edited freely when active occupancy exists.
- A Pemilik Rumah Kost user can be assigned to one or more properties through `property_investor_assignments`.
- Pemilik Rumah Kost access is read-only and must be scoped to assigned properties only.

## Phase 2 Core Candidates

| Table | Reason to defer |
|---|---|
| `room_price_histories` | Useful when historical price changes must be analyzed beyond lease snapshot fields |
| `resident_documents` | Can initially be represented by `files` linked to resident; separate table later if document verification grows |
| `lease_contract_files` | Needed when formal generated contracts or e-signature are implemented |
| `resident_intake_forms` | Admin manual input can write directly to resident/lease/check-in tables in Phase 1 |

---

# Supporting Tables

Supporting tables serve communication, configuration, reporting snapshots, and operational references.

| Table | Phase | Purpose | Key fields |
|---|---:|---|---|
| `announcements` | 1 | Pengumuman untuk admin/penghuni | `property_id`, `title`, `body`, `priority`, `category`, `published_at`, `expires_at`, `created_by_user_id` |
| `announcement_audiences` | 2 | Segmentasi pengumuman | `announcement_id`, `audience_type`, `role_id`, `room_id`, `resident_id` |
| `kost_rules` | 1 | Peraturan kos yang muncul di app penghuni | `property_id`, `title`, `body`, `sort_order`, `is_active` |
| `faqs` | 1 | FAQ penghuni | `property_id`, `question`, `answer`, `sort_order`, `is_active` |
| `cleaning_schedules` | 2 | Jadwal kebersihan terstruktur | `property_id`, `day_of_week`, `area`, `task`, `assigned_to_user_id` |
| `chat_threads` | 2 | Chat penghuni-admin | `property_id`, `resident_id`, `thread_status`, `last_message_at` |
| `chat_messages` | 2 | Pesan chat | `thread_id`, `sender_user_id`, `message_body`, `message_type`, `sent_at`, `read_at` |
| `dashboard_metric_snapshots` | 2 | Snapshot reporting bila query real-time mahal | `property_id`, `metric_name`, `period_key`, `metric_value`, `captured_at` |
| `business_events` | 1 | Event domain internal untuk queue/outbox | `property_id`, `event_type`, `aggregate_type`, `aggregate_id`, `payload`, `published_at` |

Notes:

- `business_events` adalah pola outbox konseptual untuk menjaga konsistensi cross-context, misalnya Billing overdue -> Smart Lock restriction -> Notification.
- Chat bisa ditunda karena saat ini UI admin belum memiliki counterpart lengkap, sementara penghuni sudah memiliki UI chat dummy.
- Announcement, rules, dan FAQ lebih ringan dan berguna sejak Phase 1 karena sudah tampil di app penghuni.

---

# Smart Lock Tables

Smart Lock adalah bounded context terpisah. Semua aksi lock/unlock harus melalui backend, bukan langsung dari frontend.

## Phase 1 Smart Lock Tables

| Table | Purpose | Key fields |
|---|---|---|
| `smart_lock_devices` | Metadata device smart lock per kamar | `property_id`, `room_id`, `device_name`, `tuya_device_id`, `model`, `connection_status`, `lock_state`, `battery_percent`, `auto_lock_enabled`, `last_synced_at`, `last_activity_at` |
| `smart_lock_access_grants` | Hak akses penghuni/staff ke device | `property_id`, `smart_lock_device_id`, `resident_id`, `user_id`, `grant_type`, `valid_from`, `valid_until`, `grant_status` |
| `smart_lock_access_logs` | Riwayat lock/unlock | `property_id`, `smart_lock_device_id`, `room_id`, `resident_id`, `actor_user_id`, `action_type`, `source`, `result_status`, `failure_reason`, `correlation_id`, `occurred_at` |
| `smart_lock_restrictions` | Pembatasan akses karena billing/check-out/manual | `property_id`, `smart_lock_device_id`, `room_id`, `resident_id`, `reason_type`, `reason_ref_type`, `reason_ref_id`, `restriction_status`, `started_at`, `ended_at` |
| `smart_lock_alerts` | Alert battery/offline/failed attempts | `property_id`, `smart_lock_device_id`, `alert_type`, `severity`, `title`, `description`, `alert_status`, `raised_at`, `resolved_at` |

Recommended status values:

| Field | Values |
|---|---|
| `connection_status` | `online`, `offline`, `unknown` |
| `lock_state` | `locked`, `unlocked`, `restricted`, `unknown` |
| `action_type` | `lock`, `unlock`, `sync_status`, `auto_lock`, `restrict`, `unrestrict` |
| `source` | `resident_app`, `admin_dashboard`, `auto_lock`, `billing_system`, `checkout_workflow`, `maintenance` |
| `result_status` | `success`, `failed`, `timeout`, `queued` |
| `reason_type` | `billing_overdue`, `checkout_completed`, `manual_admin`, `security_incident` |

Pemilik Rumah Kost rule:

- Pemilik Rumah Kost may see high-level smart lock status only if a future product permission explicitly allows it.
- Pemilik Rumah Kost must never receive `smart_lock.command` permission and must not create `smart_lock_access_logs` as command actor except denied access audit events.

## Phase 2 Smart Lock Candidates

| Table | Reason to defer |
|---|---|
| `smart_lock_commands` | Needed when asynchronous vendor command queue is implemented |
| `smart_lock_telemetry_samples` | Useful for high-frequency battery/signal logs, but not required for initial CRUD/control |
| `smart_lock_provider_tokens` | Only if provider token lifecycle must be stored beyond environment/secrets manager |
| `smart_lock_failed_attempt_windows` | Can be calculated from logs initially; materialize later for security automation |

---

# CCTV Tables

CCTV is a separate bounded context. Recording remains local on NVR/gateway; PostgreSQL stores metadata, authorization, preview sessions, snapshots metadata, and audit.

## Phase 1 CCTV Tables

| Table | Purpose | Key fields |
|---|---|---|
| `cameras` | Metadata camera/CCTV | `property_id`, `camera_code`, `name`, `location`, `nvr_camera_id`, `stream_profile`, `connection_status`, `last_activity_at`, `thumbnail_file_id`, `is_active` |
| `camera_preview_sessions` | Sesi preview/token admin | `property_id`, `camera_id`, `requested_by_user_id`, `session_token_hash`, `started_at`, `expires_at`, `ended_at`, `session_status` |
| `camera_access_logs` | Audit akses preview/snapshot | `property_id`, `camera_id`, `actor_user_id`, `action_type`, `result_status`, `ip_address`, `user_agent`, `correlation_id`, `occurred_at` |
| `camera_alerts` | Alert kamera offline/error | `property_id`, `camera_id`, `alert_type`, `severity`, `description`, `alert_status`, `raised_at`, `resolved_at` |

Recommended values:

| Field | Values |
|---|---|
| `connection_status` | `online`, `offline`, `unknown` |
| `action_type` | `preview_start`, `preview_end`, `snapshot`, `refresh`, `token_issued`, `token_denied` |
| `session_status` | `active`, `expired`, `ended`, `revoked` |

Pemilik Rumah Kost rule:

- Pemilik Rumah Kost has no CCTV access by default.
- Any future CCTV access for Pemilik Rumah Kost must be an explicit permission grant and must still be scoped to assigned property only.

## Phase 2 CCTV Candidates

| Table | Reason to defer |
|---|---|
| `camera_motion_events` | Needed only if motion detection integration is implemented |
| `camera_snapshots` | Could be represented by `files` plus `camera_access_logs` initially |
| `nvr_gateways` | Required when multiple local gateways/NVRs are managed |
| `camera_stream_health_samples` | Useful for analytics, not required for Phase 1 preview metadata |

---

# Billing Tables

Billing drives revenue and triggers Smart Lock restriction when overdue.

## Phase 1 Billing Tables

| Table | Purpose | Key fields |
|---|---|---|
| `billing_periods` | Periode tagihan per property | `property_id`, `period_key`, `start_date`, `end_date`, `due_date`, `status` |
| `invoices` | Tagihan penghuni | `property_id`, `resident_id`, `room_id`, `lease_id`, `billing_period_id`, `invoice_code`, `invoice_status`, `subtotal_amount`, `late_fee_amount`, `total_amount`, `due_date`, `issued_at`, `paid_at` |
| `invoice_line_items` | Breakdown tagihan | `invoice_id`, `line_type`, `description`, `quantity`, `unit_amount`, `total_amount`, `sort_order` |
| `payments` | Transaksi pembayaran | `property_id`, `resident_id`, `payment_code`, `payment_method`, `payment_status`, `amount`, `paid_at`, `received_by_user_id`, `reference_number`, `notes` |
| `payment_allocations` | Alokasi payment ke invoice/deposit | `payment_id`, `target_type`, `target_id`, `allocated_amount` |
| `late_fee_assessments` | Catatan denda keterlambatan | `property_id`, `invoice_id`, `days_overdue`, `rate_percent_per_day`, `assessed_amount`, `assessed_at` |

Recommended values:

| Field | Values |
|---|---|
| `invoice_status` | `draft`, `issued`, `unpaid`, `partially_paid`, `paid`, `overdue`, `void` |
| `line_type` | `rent`, `electricity`, `water`, `wifi`, `late_fee`, `adjustment`, `other` |
| `payment_method` | `cash`, `bank_transfer`, `qris`, `ewallet`, `other` |
| `payment_status` | `pending`, `verified`, `failed`, `cancelled`, `refunded` |

Rules:

- Invoice should snapshot room price and lease data at issuance time.
- Payment does not directly overwrite invoice amount.
- Payment allocations allow one payment to settle multiple invoices or a deposit item later.
- Overdue invoice can publish a domain event that creates `smart_lock_restrictions`.
- Current frontend supports QRIS, bank transfer, and e-wallet on penghuni app, while admin supports manual marking. Phase 1 can support manual verification first.

## Phase 2 Billing Candidates

| Table | Reason to defer |
|---|---|
| `payment_gateway_transactions` | Needed when integrating external gateway callbacks |
| `payment_method_accounts` | Needed when managing multiple bank/QRIS accounts |
| `utility_meter_readings` | Depends on final utility calculation model |
| `invoice_pdf_generations` | Can initially be represented by `files` linked to invoices |

---

# Deposit Tables

Deposit is mandatory business domain. It must be paid at check-in and can be refunded at check-out.

## Phase 1 Deposit Tables

| Table | Purpose | Key fields |
|---|---|---|
| `deposits` | Deposit per active lease/resident | `property_id`, `lease_id`, `resident_id`, `room_id`, `deposit_code`, `required_amount`, `paid_amount`, `refunded_amount`, `deposit_status`, `paid_at`, `settled_at` |
| `deposit_transactions` | Ledger deposit | `property_id`, `deposit_id`, `transaction_type`, `amount`, `transaction_status`, `payment_id`, `created_by_user_id`, `occurred_at`, `notes` |
| `deposit_deductions` | Potongan deposit saat check-out | `property_id`, `deposit_id`, `check_out_request_id`, `deduction_type`, `description`, `amount`, `approved_by_user_id`, `approved_at` |
| `deposit_refunds` | Pengembalian deposit | `property_id`, `deposit_id`, `check_out_request_id`, `refund_amount`, `refund_method`, `refund_status`, `processed_by_user_id`, `processed_at`, `reference_number` |

Recommended values:

| Field | Values |
|---|---|
| `deposit_status` | `pending_payment`, `paid`, `partially_refunded`, `fully_refunded`, `forfeited`, `cancelled` |
| `transaction_type` | `charge`, `payment`, `deduction`, `refund`, `adjustment` |
| `deduction_type` | `damage`, `unpaid_bill`, `lost_item`, `cleaning_fee`, `other` |
| `refund_status` | `pending`, `approved`, `paid`, `failed`, `cancelled` |

Rules:

- Deposit is tied to a lease, not only to a resident, because a resident can move room or start a new lease later.
- Check-in should not be marked complete until required deposit policy is satisfied, unless Owner/Manager explicitly overrides with audit.
- Check-out settlement must reconcile unpaid invoices, approved deductions, and refundable balance.
- Deposit deduction should be auditable and optionally backed by files/photos.

## Phase 2 Deposit Candidates

| Table | Reason to defer |
|---|---|
| `deposit_refund_bank_accounts` | Use resident profile/manual notes first if refund automation is not implemented |
| `deposit_disbursement_batches` | Needed for bulk payout workflow |

---

# Maintenance Tables

Maintenance includes technicians, work orders, assignments, and operational work history. Complaints can create maintenance work orders, but maintenance may also be created internally.

## Phase 1 Maintenance Tables

| Table | Purpose | Key fields |
|---|---|---|
| `technician_profiles` | Profil teknisi linked to user | `property_id`, `user_id`, `display_name`, `phone`, `skill_tags`, `is_active` |
| `maintenance_work_orders` | Pekerjaan maintenance | `property_id`, `room_id`, `complaint_id`, `work_order_code`, `title`, `description`, `priority`, `work_order_status`, `assigned_to_user_id`, `scheduled_at`, `completed_at` |
| `maintenance_work_order_histories` | Riwayat perubahan work order | `work_order_id`, `from_status`, `to_status`, `changed_by_user_id`, `changed_at`, `notes` |
| `maintenance_materials` | Material/biaya pekerjaan sederhana | `work_order_id`, `item_name`, `quantity`, `unit_cost`, `total_cost` |

Recommended values:

| Field | Values |
|---|---|
| `work_order_status` | `open`, `assigned`, `in_progress`, `completed`, `cancelled` |
| `priority` | `low`, `medium`, `high`, `urgent` |

## Phase 2 Maintenance Candidates

| Table | Reason to defer |
|---|---|
| `preventive_maintenance_schedules` | Useful later for AC, water pump, electrical checks |
| `maintenance_vendor_profiles` | Needed if external vendors are managed |
| `asset_maintenance_records` | Needed after property assets are modeled beyond rooms/devices |

---

# Complaint Tables

Complaint is penghuni-facing ticket workflow and admin-facing operational queue.

## Phase 1 Complaint Tables

| Table | Purpose | Key fields |
|---|---|---|
| `complaint_categories` | Master kategori komplain | `property_id`, `name`, `normalized_code`, `is_active`, `sort_order` |
| `complaints` | Tiket komplain | `property_id`, `resident_id`, `room_id`, `complaint_code`, `category_id`, `title`, `description`, `priority`, `complaint_status`, `submitted_at`, `assigned_to_user_id`, `resolved_at` |
| `complaint_status_histories` | Timeline tiket | `complaint_id`, `from_status`, `to_status`, `label`, `changed_by_user_id`, `changed_at`, `notes` |
| `complaint_files` | Lampiran/foto komplain | `complaint_id`, `file_id`, `uploaded_by_user_id`, `caption` |

Recommended category normalization:

| UI source | Canonical category |
|---|---|
| `WiFi`, `Internet` | `internet` |
| `Kerusakan kamar`, `Fasilitas` | keep separate only if reporting needs it; otherwise map to `room_facility` |
| `AC` | `ac` |
| `Air` | `water` |
| `Listrik` | `electricity` |
| `Kebersihan` | `cleanliness` |
| `Keamanan` | `security` |
| `Lainnya` | `other` |

Recommended values:

| Field | Values |
|---|---|
| `complaint_status` | `waiting`, `processing`, `done`, `cancelled` |
| `priority` | `low`, `medium`, `high`, `urgent` |

Rules:

- Penghuni can create complaints only for their own active occupancy.
- Admin/Manager can assign complaint to Teknisi.
- Every status change creates `complaint_status_histories`.
- A complaint may create one maintenance work order.

## Phase 2 Complaint Candidates

| Table | Reason to defer |
|---|---|
| `complaint_comments` | Needed if ticket conversation differs from chat |
| `complaint_sla_policies` | Useful when response/resolution SLA is formalized |
| `complaint_ratings` | Useful after post-resolution feedback is added |

---

# Notification Tables

Notifications are required for billing reminders, complaint updates, announcements, smart lock alerts, CCTV alerts, check-out progress, and deposit settlement.

## Phase 1 Notification Tables

| Table | Purpose | Key fields |
|---|---|---|
| `notifications` | Notification message | `property_id`, `recipient_user_id`, `notification_type`, `title`, `body`, `source_type`, `source_id`, `priority`, `read_at`, `created_at` |
| `notification_preferences` | Preferensi user | `user_id`, `channel`, `notification_type`, `is_enabled` |
| `notification_deliveries` | Delivery attempt per channel | `notification_id`, `channel`, `delivery_status`, `sent_at`, `failed_reason` |

Recommended values:

| Field | Values |
|---|---|
| `notification_type` | `billing`, `payment`, `complaint`, `announcement`, `smart_lock`, `cctv`, `check_out`, `deposit`, `system` |
| `channel` | `in_app`, `email`, `push`, `whatsapp` |
| `delivery_status` | `pending`, `sent`, `failed`, `skipped` |

Phase guidance:

- Phase 1 can implement only `in_app` delivery plus stored preferences.
- Email/push/WhatsApp delivery can be Phase 2 while preserving `notification_deliveries`.

---

# Audit Log Tables

Audit must support security, compliance, debugging, and incident investigation.

## Phase 1 Audit Tables

| Table | Purpose | Key fields |
|---|---|---|
| `audit_logs` | Generic audit for business actions | `property_id`, `actor_user_id`, `action`, `resource_type`, `resource_id`, `before_data`, `after_data`, `ip_address`, `user_agent`, `correlation_id`, `occurred_at` |
| `auth_audit_logs` | Authentication/security events | `user_id`, `event_type`, `result_status`, `ip_address`, `user_agent`, `occurred_at`, `metadata` |
| `data_change_requests` | Optional approval trail for sensitive changes | `property_id`, `requested_by_user_id`, `approved_by_user_id`, `resource_type`, `resource_id`, `change_status`, `payload`, `requested_at`, `approved_at` |

Specialized audit tables:

- Smart Lock uses `smart_lock_access_logs`.
- CCTV uses `camera_access_logs`.
- Complaint uses `complaint_status_histories`.
- Maintenance uses `maintenance_work_order_histories`.
- Deposit uses `deposit_transactions`, `deposit_deductions`, and `deposit_refunds`.
- Billing uses invoices/payments plus generic audit for edits/voids.

Audit requirements by operation:

| Operation | Audit target |
|---|---|
| Login/logout/failed login | `auth_audit_logs` |
| Change role/permission | `audit_logs` |
| Create/update resident | `audit_logs` |
| Create/check-in/check-out lease | `audit_logs` plus domain table |
| Deposit payment/deduction/refund | deposit tables plus `audit_logs` |
| Invoice void/payment verification | billing tables plus `audit_logs` |
| Smart Lock command | `smart_lock_access_logs` |
| CCTV preview/snapshot | `camera_access_logs` |

---

# File Management Tables

Files appear in room photos, logo, complaint photos, invoice PDFs, CCTV snapshots, KTP/identity files, check-out inspection photos, and deposit deduction evidence.

## Phase 1 File Tables

| Table | Purpose | Key fields |
|---|---|---|
| `files` | Metadata file object | `property_id`, `uploaded_by_user_id`, `storage_provider`, `bucket_name`, `object_key`, `original_filename`, `mime_type`, `file_size`, `checksum`, `visibility`, `created_at`, `deleted_at` |
| `file_links` | Link file to domain entity | `file_id`, `resource_type`, `resource_id`, `purpose`, `sort_order` |
| `file_access_logs` | Audit akses file sensitif | `file_id`, `actor_user_id`, `action_type`, `result_status`, `occurred_at`, `ip_address` |

Recommended file purposes:

- `property_logo`
- `room_photo`
- `resident_identity`
- `complaint_photo`
- `maintenance_photo`
- `invoice_pdf`
- `deposit_evidence`
- `check_out_inspection_photo`
- `cctv_snapshot`

Rules:

- Store files outside PostgreSQL; store metadata and references in PostgreSQL.
- Never expose raw private object keys directly to frontend.
- Use signed URLs or backend streaming for private files.
- Sensitive files should have `file_access_logs`.

---

# Authentication & RBAC Tables

Role system is final: Owner platform, Manager, Admin, Teknisi, Penghuni, Pemilik Rumah Kost.

Pemilik Rumah Kost is a property investor, not platform owner. The technical role may be named `property_owner` or `property_investor`; this document recommends `property_investor` to avoid ambiguity with Owner platform. Product/UI copy must use "Pemilik Rumah Kost".

## Phase 1 Authentication & RBAC Tables

| Table | Purpose | Key fields |
|---|---|---|
| `users` | Login identity | `id`, `email`, `phone`, `password_hash`, `display_name`, `user_status`, `last_login_at` |
| `roles` | Role master | `id`, `code`, `name`, `description`, `is_system_role` |
| `permissions` | Permission master | `id`, `code`, `name`, `description` |
| `role_permissions` | Role to permission mapping | `role_id`, `permission_id` |
| `user_property_roles` | User role scoped to property | `user_id`, `property_id`, `role_id`, `assigned_by_user_id`, `assigned_at`, `revoked_at` |
| `property_investor_assignments` | Business ownership link between investor user and property | `user_id`, `property_id`, `ownership_label`, `ownership_status`, `effective_from`, `effective_until`, `assigned_by_user_id` |
| `user_sessions` | Refresh/session tracking | `user_id`, `session_token_hash`, `device_name`, `ip_address`, `user_agent`, `expires_at`, `revoked_at` |
| `password_reset_tokens` | Password reset flow | `user_id`, `token_hash`, `expires_at`, `used_at` |

Seed roles:

| Role code | Business meaning |
|---|---|
| `owner` | Owner platform/operator, akses penuh sesuai scope platform dan property yang dikelola |
| `manager` | Pengelola operasional, akses luas tanpa owner-only settings tertentu |
| `admin` | Staff administrasi, input penghuni, billing, komplain, notifikasi |
| `technician` | Teknisi, akses work order/komplain yang ditugaskan |
| `resident` | Penghuni, akses data miliknya sendiri |
| `property_investor` | Pemilik Rumah Kost, akses read-only untuk property yang dimilikinya; `property_owner` boleh dipakai sebagai alias teknis jika tim memilihnya nanti |

Example permission areas:

- `property.manage`
- `property.read`
- `room.manage`
- `room.read`
- `resident.manage`
- `resident.read`
- `lease.manage`
- `checkout.manage`
- `deposit.manage`
- `billing.manage`
- `billing.read`
- `payment.verify`
- `complaint.manage`
- `maintenance.manage`
- `smart_lock.view`
- `smart_lock.command`
- `cctv.view`
- `notification.manage`
- `report.view`
- `property_investor.report.view`
- `rbac.manage`
- `audit.view`

Rules:

- Penghuni access must be row-scoped to their own `resident_id`.
- Teknisi access should be limited to assigned work orders/complaints unless elevated.
- Owner/Manager/Admin can access property data based on `user_property_roles`.
- Pemilik Rumah Kost access must be read-only and scoped by both `property_investor_assignments` and `user_property_roles`.
- Pemilik Rumah Kost may view property profile, rooms, resident information, invoices/payments, and summary revenue reports for assigned properties only.
- Pemilik Rumah Kost must not receive manage/write permissions for operational data, billing changes, resident management, smart lock command, CCTV access, or system settings.
- CCTV access should require explicit permission, not merely admin login.
- Smart Lock command should require explicit permission and audit.

---

# Relationship Mapping

High-level relationship map:

| Relationship | Cardinality | Notes |
|---|---|---|
| Property -> Rooms | 1:N | Room number unique within property |
| Property -> Users via roles | M:N | Through `user_property_roles` |
| Property -> Pemilik Rumah Kost | M:N | Through `property_investor_assignments`; one investor user can own one or more properties |
| RoomType -> Rooms | 1:N | Room stores current type and price snapshot can also live in lease |
| Room -> Facilities | M:N | Through `room_facility_assignments` |
| User -> Resident | 1:0..1 | A resident has a user login when penghuni app access is enabled |
| Resident -> Leases | 1:N | History of sewa over time |
| Room -> Leases | 1:N | History of room occupancy over time |
| Lease -> Occupancy | 1:1 or 1:N | Usually 1 active occupancy; can support room move later |
| Room -> Active Occupancy | 1:0..1 | Enforced with active uniqueness |
| Resident -> Active Occupancy | 1:0..1 | Enforced with active uniqueness |
| Lease -> Lease Extension Requests | 1:N | Self-service penghuni request |
| Lease -> Check-in Record | 1:0..1 | Created when resident enters |
| Lease -> Check-out Requests | 1:N | Usually one final request, but cancelled requests can exist |
| Check-out Request -> Inspection | 1:0..1 | Required before deposit settlement |
| Check-out Request -> Tasks | 1:N | Disable lock, inspect room, settle invoice, refund deposit |
| Lease -> Deposit | 1:1 | Deposit tied to lease |
| Deposit -> Transactions | 1:N | Ledger pattern |
| Deposit -> Deductions | 1:N | Deductions during settlement |
| Deposit -> Refunds | 1:N | Allows partial/refailed refunds |
| Billing Period -> Invoices | 1:N | Monthly billing |
| Invoice -> Line Items | 1:N | Breakdown from frontend billing |
| Payment -> Payment Allocations | 1:N | Allocation to invoices or deposit |
| Resident -> Complaints | 1:N | Penghuni tickets |
| Complaint -> Maintenance Work Order | 1:0..N | Usually one, but can support multiple tasks |
| Complaint -> Files | M:N | Through `complaint_files` or `file_links` |
| Room -> Smart Lock Device | 1:0..1 active | One device per room initially |
| Smart Lock Device -> Access Logs | 1:N | High volume |
| Smart Lock Restriction -> Invoice/Checkout | N:1 by reference | Generic reason reference |
| Property -> Cameras | 1:N | CCTV metadata only |
| Camera -> Preview Sessions | 1:N | Short-lived token/session |
| Camera -> Access Logs | 1:N | High volume audit |
| User -> Notifications | 1:N | Recipient-based |
| File -> File Links | 1:N | Same file can be linked to one or more resources if needed |

Critical workflow relationships:

1. Manual resident onboarding:
   Admin creates user/resident -> creates lease -> receives deposit -> check-in record -> creates active occupancy -> room becomes occupied -> optional smart lock grant.

2. Lease extension:
   Penghuni creates lease extension request -> Admin/Manager reviews -> lease end date updated or new lease created -> invoice schedule adjusted -> notification sent.

3. Check-out:
   Request created -> inspection done -> unpaid invoices checked -> deposit deductions/refund calculated -> active occupancy closed -> room status changes to vacant or maintenance -> smart lock grant revoked/restricted -> audit and notification emitted.

4. Billing overdue:
   Invoice due date passes -> invoice status overdue -> late fee assessment -> business event -> smart lock restriction -> notification to penghuni/admin.

---

# Soft Delete Strategy

Recommended approach:

| Table group | Strategy |
|---|---|
| Master data (`rooms`, `room_types`, `facilities`, `categories`) | Soft delete with `deleted_at`; block delete if active dependency exists |
| Residents/users | Soft delete/deactivate; preserve historical financial and occupancy records |
| Leases/occupancies | Do not delete in normal operation; close with status/end date |
| Billing/payment/deposit | Do not soft delete casually; use `void`, `cancelled`, `adjustment`, or reversal records |
| Complaint/maintenance | Soft delete only for mistaken test records before production; otherwise status/cancel |
| Smart Lock/CCTV devices | Deactivate, do not delete if logs exist |
| Logs/audit | No soft delete; use retention/archive policy |
| Files | Soft delete metadata; object deletion follows retention and legal policy |

Guidelines:

- Add `deleted_at`, `deleted_by_user_id`, and `delete_reason` where soft deletion is allowed.
- Do not hide financial or security history by default in admin reporting; filter only active operational records.
- Unique indexes for soft-deleted master records should consider active rows only, e.g. room number unique among non-deleted rooms per property.

---

# Audit Strategy

Audit should answer: who did what, to which resource, when, from where, with what result, and under which correlation/request id.

Minimum fields for auditable operations:

- `actor_user_id`
- `property_id`
- `action`
- `resource_type`
- `resource_id`
- `before_data` and `after_data` for update operations
- `result_status`
- `ip_address`
- `user_agent`
- `correlation_id`
- `occurred_at`

Recommended implementation pattern:

- NestJS request middleware creates `correlation_id`.
- All write operations pass actor context into service layer.
- Domain services emit business events for cross-context workflows.
- Sensitive domain tables store their own histories when query needs are high.
- Generic `audit_logs` stores cross-cutting change records.

High-priority audited actions for Phase 1:

| Area | Actions |
|---|---|
| IAM/RBAC | login, failed login, logout, password reset, role assignment, permission change |
| Resident | create, update PII, deactivate/reactivate |
| Room | create, update price/status/facility, deactivate |
| Lease | create, approve extension, terminate |
| Check-in/out | check-in complete, check-out approval, inspection completion |
| Deposit | charge, payment, deduction approval, refund approval/payment |
| Billing | invoice issue, payment verification, void, late fee assessment |
| Smart Lock | lock, unlock, restrict, unrestrict, failed command |
| CCTV | preview start/end, snapshot, denied access |
| Files | upload, download/view private file, delete |

---

# Retention Strategy

Retention should balance operational needs, security, storage cost, and privacy.

| Data group | Suggested retention |
|---|---|
| Residents and leases | Keep while active and at least 5 years after last lease ends |
| Billing, payments, deposit ledger | Keep at least 5 years; preferably 7 years if needed for financial audit |
| Audit logs for financial/RBAC/resident changes | Keep at least 5 years |
| Smart Lock access logs | Keep 12-24 months online; archive older if needed |
| CCTV access logs | Keep 12-24 months online; archive older if needed |
| CCTV recordings | Not stored in PostgreSQL; governed by local NVR retention |
| Camera snapshots | Keep only if explicitly saved as evidence; otherwise short retention |
| Notifications | Keep 12 months, or less for low-value read notifications |
| Chat messages | Keep 12-24 months; longer only if tied to complaints/incidents |
| Complaint/maintenance records | Keep 3-5 years depending operational policy |
| Private files/KTP | Keep only as long as legal/business need; restrict access and delete/anonymize after retention |
| Redis cache/session data | Short-lived; not authoritative |

Partitioning guidance:

- Consider time-based partitioning for `audit_logs`, `smart_lock_access_logs`, `camera_access_logs`, `notification_deliveries`, and high-volume event tables.
- Start without over-partitioning if volume is low, but design table ownership and indexes so partitioning can be added later.

---

# Index Strategy

Indexing should follow actual UI/API access patterns from Admin and Penghuni apps.

## Phase 1 Must-Have Indexes

| Table | Query pattern | Recommended index shape |
|---|---|---|
| `rooms` | list by property/status/floor/type | `property_id`, `room_status`, `floor`, `room_type_id` |
| `rooms` | unique room number per property | unique active `property_id`, `number` |
| `residents` | search by name/phone/room | `property_id`, `resident_status`; trigram/search index later for name/phone |
| `residents` | KTP uniqueness | unique `ktp_number` where present and active |
| `occupancies` | active occupancy by room | partial unique active `room_id` |
| `occupancies` | active occupancy by resident | partial unique active `resident_id` |
| `leases` | active/expiring leases | `property_id`, `lease_status`, `end_date` |
| `lease_extension_requests` | review queue | `property_id`, `request_status`, `requested_at` |
| `invoices` | unpaid/overdue list | `property_id`, `invoice_status`, `due_date` |
| `invoices` | penghuni billing page | `resident_id`, `issued_at` descending |
| `payments` | admin payment history | `property_id`, `payment_status`, `paid_at` descending |
| `deposits` | checkout settlement | `lease_id`, `deposit_status` |
| `complaints` | admin queue/filter | `property_id`, `complaint_status`, `priority`, `submitted_at` descending |
| `complaints` | penghuni ticket history | `resident_id`, `submitted_at` descending |
| `maintenance_work_orders` | technician queue | `assigned_to_user_id`, `work_order_status`, `scheduled_at` |
| `notifications` | unread notifications | `recipient_user_id`, `read_at`, `created_at` descending |
| `smart_lock_devices` | dashboard by property/state | `property_id`, `connection_status`, `lock_state` |
| `smart_lock_access_logs` | history filters | `property_id`, `occurred_at` descending, `action_type`, `source` |
| `cameras` | CCTV grid | `property_id`, `connection_status`, `location` |
| `camera_access_logs` | audit by camera/time | `camera_id`, `occurred_at` descending |
| `audit_logs` | resource audit | `resource_type`, `resource_id`, `occurred_at` descending |
| `files` | file ownership | `property_id`, `created_at` descending |
| `user_property_roles` | authorization check | `user_id`, `property_id`, `revoked_at` |
| `property_investor_assignments` | investor property scope | `user_id`, `property_id`, `ownership_status` |

## PostgreSQL-Specific Recommendations

- Use partial unique indexes for active occupancy constraints.
- Use composite indexes aligned with `WHERE property_id = ? AND status = ? ORDER BY created_at DESC`.
- Use BRIN indexes later for very large append-only logs by timestamp.
- Use GIN/trigram indexes later for fuzzy search on resident names, phone, complaint text, and booking/intake searches.
- Use JSONB only for provider payload and flexible metadata; if a field is filtered in UI, make it a normal column.
- Avoid indexing every foreign key blindly in Phase 1, but index all high-cardinality relationships used in joins and filters.
- Monitor with query plans after real API endpoints exist; this planning document is a starting point, not final tuning.

---

# Future Expansion Notes

Recommended Phase 1 table set:

| Category | Tables |
|---|---|
| Core | `properties`, `property_settings`, `property_investor_assignments`, `room_types`, `room_facilities`, `rooms`, `room_facility_assignments`, `residents`, `occupancies`, `leases`, `lease_extension_requests`, `check_in_records`, `check_out_requests`, `check_out_inspections`, `check_out_tasks` |
| Billing | `billing_periods`, `invoices`, `invoice_line_items`, `payments`, `payment_allocations`, `late_fee_assessments` |
| Deposit | `deposits`, `deposit_transactions`, `deposit_deductions`, `deposit_refunds` |
| Complaint/Maintenance | `complaint_categories`, `complaints`, `complaint_status_histories`, `complaint_files`, `technician_profiles`, `maintenance_work_orders`, `maintenance_work_order_histories`, `maintenance_materials` |
| Smart Lock | `smart_lock_devices`, `smart_lock_access_grants`, `smart_lock_access_logs`, `smart_lock_restrictions`, `smart_lock_alerts` |
| CCTV | `cameras`, `camera_preview_sessions`, `camera_access_logs`, `camera_alerts` |
| Communication | `announcements`, `kost_rules`, `faqs`, `notifications`, `notification_preferences`, `notification_deliveries` |
| File/Audit | `files`, `file_links`, `file_access_logs`, `audit_logs`, `auth_audit_logs`, `business_events` |
| IAM/RBAC | `users`, `roles`, `permissions`, `role_permissions`, `user_property_roles`, `user_sessions`, `password_reset_tokens` |

Recommended Phase 2 table set:

| Category | Tables |
|---|---|
| Public booking | `bookings`, `booking_fee_payments`, `booking_status_histories`, `resident_intake_forms` |
| Advanced billing | `payment_gateway_transactions`, `payment_method_accounts`, `utility_meter_readings`, `invoice_pdf_generations` |
| Advanced deposit | `deposit_refund_bank_accounts`, `deposit_disbursement_batches` |
| Smart Lock expansion | `smart_lock_commands`, `smart_lock_telemetry_samples`, `smart_lock_provider_tokens`, `smart_lock_failed_attempt_windows` |
| CCTV expansion | `nvr_gateways`, `camera_motion_events`, `camera_snapshots`, `camera_stream_health_samples` |
| Communication expansion | `chat_threads`, `chat_messages`, `announcement_audiences`, push/WhatsApp delivery provider tables |
| Maintenance expansion | `preventive_maintenance_schedules`, `maintenance_vendor_profiles`, `asset_maintenance_records` |
| Reporting expansion | `dashboard_metric_snapshots`, materialized reporting tables |
| Legal/contract | `lease_contract_files`, digital signature records |

Important architectural notes for API planning:

- Do not expose internal database IDs unnecessarily in public/resident APIs when a business code is sufficient.
- Separate admin routes and penghuni routes at API authorization level, not only frontend route level.
- Pemilik Rumah Kost APIs must be read-only and must always filter by assigned `property_id`; never trust a property id from request params without checking `property_investor_assignments`.
- Smart Lock command APIs should be rate-limited with Redis and always write access logs.
- CCTV preview APIs should issue short-lived tokens and always write camera access logs.
- Billing overdue to Smart Lock restriction should use a domain event/outbox flow to reduce tight synchronous coupling.
- Check-out should be modeled as a stateful workflow, not a single "set resident inactive" update.
- Deposit settlement should be an explicit API surface because it crosses check-out, billing, payment, file evidence, and audit.
- Public booking tables should remain Phase 2 unless business reverses the current decision that online public booking is not needed.

This document is intentionally schema-level planning only. Migration design, SQL DDL, Prisma schema, TypeORM entity classes, and seed implementation should be produced after `API_PLANNING.md` confirms endpoint boundaries and service ownership.
