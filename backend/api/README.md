# Granada Kost Backend API

Backend API menggunakan NestJS sebagai modular monolith foundation untuk Granada Kost Platform.

## Scope Saat Ini

Foundation yang sudah tersedia:

- NestJS bootstrap di `backend/api`.
- Config Module global dengan validasi environment.
- PostgreSQL connection foundation.
- Redis connection foundation.
- Global validation pipe.
- Global exception filter dengan error shape standar.
- Request correlation id middleware.
- Structured logger foundation berbasis Pino.
- Health endpoint.
- ESLint dan Prettier.

Milestone 2 IAM/Auth/RBAC:

- Users, roles, permissions, role permissions.
- User property scope.
- Property owner assignment table untuk scope Pemilik Rumah Kost.
- JWT access token.
- Refresh token rotation.
- Session revocation.
- Argon2 password hashing.
- Change password foundation.
- Auth audit log untuk login, logout, refresh failure, session revoke, dan password change.
- Redis-backed rate limit untuk login endpoint.
- JWT auth guard, RBAC guard, permission decorator, role decorator, dan current user decorator.

Belum ada business module operasional. Property, Room, Resident, Billing, Complaint, Smart Lock, dan CCTV belum diimplementasikan.

## Prasyarat

- Node.js `>=22`
- npm `>=10`
- PostgreSQL lokal atau remote
- Redis lokal atau remote

Catatan: salah satu dependency ESLint meminta Node `^22.13.0` atau compatible range lain. Bila lint bermasalah di mesin lokal, update Node dari `22.12.0` ke `22.13.0+`.

## Environment

Salin `.env.example` menjadi `.env`, lalu sesuaikan nilai lokal:

```bash
cp backend/api/.env.example backend/api/.env
```

Variabel utama:

| Variable | Fungsi |
|---|---|
| `PORT` | Port HTTP API, default `3000` |
| `API_PREFIX` | Prefix route API, default `api/v1` |
| `CORS_ALLOWED_ORIGINS` | Allowlist origin admin dan penghuni |
| `JWT_ACCESS_SECRET` | Secret JWT access token, minimal 32 karakter |
| `JWT_ACCESS_TTL_SECONDS` | TTL access token |
| `REFRESH_TOKEN_TTL_DAYS` | TTL refresh/session credential |
| `DATABASE_URL` | Connection string PostgreSQL |
| `REDIS_URL` | Connection string Redis |
| `LOG_LEVEL` | Level structured log |

## Menjalankan Backend

Dari root monorepo:

```bash
npm run dev:api
```

Atau langsung ke workspace:

```bash
npm --workspace @granada-kost/api run dev
```

Build production:

```bash
npm run build:api
npm --workspace @granada-kost/api run start:prod
```

Lint dan format:

```bash
npm run lint:api
npm run format:api
```

## Database Migration dan Seed

```bash
npm run db:migrate:api
npm run db:seed:api
```

Core seed Layer 0-5 bersifat idempotent dan mengisi:

- `roles`
- `permissions`
- `role_permissions`
- owner user
- `user_property_roles`
- property `Granada Student House Jatinangor`
- `property_settings`
- room types `RuKost Standard` dan `ApartKost Standard`
- 8 `room_facilities`
- 163 rooms master: 123 RuKost dan 40 ApartKost

Seed rooms Layer 5 mengikuti convention:

- RuKost: `RK-{unit_code}-{room_number_padded}`, contoh `RK-01-01`
- ApartKost: `AK-{unit_code}-{room_code}`, contoh `AK-05A-1B`
- `unit_code` wajib terisi.
- `gender_policy` hanya `male` atau `female`, tidak ada `mixed`.
- `monthly_price = 1800000`, `deposit_amount = 0`, `room_status = vacant`.

Seed development:

```bash
npm run db:seed:dev
```

`db:seed:dev` menambahkan development-only dummy data:

- 10 Penghuni fiktif dengan email `.test`, telepon dummy, dan KTP dummy.
- 10 user login Penghuni fiktif dengan password `GranadaResident@Dev2026!`.
- 10 emergency contacts fiktif.
- 8 active occupancies.
- 8 check-in records.
- 8 occupancy history records.
- 8 kamar menjadi `occupied`, 155 kamar tetap `vacant`.
- 1 primary active payment account BSI untuk Granada:
  - Bank: `BSI / Bank Syariah Indonesia`
  - Account number: `7318321153`
  - Account holder: `PT SON SMART LIVING`
- 8 issued invoice development untuk periode bulan berjalan, due date tanggal 25, mengikuti `rooms.monthly_price`.

Data development ini tidak berjalan pada `db:seed` biasa atau `db:seed:prod`.

Validasi workflow Billing Phase 1 development:

```bash
npm --workspace @granada-kost/api run billing:validate-workflow
```

Script validasi ini development-only dan membutuhkan `db:seed:dev`. Skenario yang dicek:

- create invoice dan issue invoice.
- record manual bank transfer payment.
- partial payment dan outstanding balance.
- create payment proof, reject proof, verify proof.
- resident hanya membaca invoice miliknya.
- property owner billing summary sebagai aggregate read-only.

Seed production membutuhkan password owner dari environment. Contoh PowerShell:

```powershell
$env:SEED_OWNER_EMAIL = "owner@granada.id"
$env:SEED_OWNER_PASSWORD = "<strong-password>"
npm.cmd run db:seed:prod
```

Seed production tidak membuat Penghuni, occupancy, billing, complaint, vehicle, Smart Lock, atau CCTV.

## Cara Test Login Lokal

1. Jalankan migration dan seed:

```bash
npm run db:migrate:api
npm run db:seed:api
```

2. Generate hash password:

```bash
npm --workspace @granada-kost/api run auth:hash-password -- "PasswordDev123!"
```

3. Insert user dev dan assign role. Ganti `<ARGON2_HASH>` dengan output command di atas:

```sql
INSERT INTO users (email, password_hash, display_name, user_status)
VALUES ('owner@granada.test', '<ARGON2_HASH>', 'Owner Granada', 'active')
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    user_status = EXCLUDED.user_status;

INSERT INTO user_property_roles (user_id, role_id)
SELECT users.id, roles.id
FROM users
JOIN roles ON roles.code = 'owner'
WHERE users.email = 'owner@granada.test'
ON CONFLICT DO NOTHING;
```

4. Start API:

```bash
npm run dev:api
```

5. Login:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"owner@granada.test\",\"password\":\"PasswordDev123!\",\"device_name\":\"local\"}"
```

Response berisi `access_token` dan `refresh_token`. Backend hanya menyimpan hash dari secret refresh token.

## Endpoint Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/:sessionId`
- `PATCH /api/v1/auth/password`

## Health Check

```text
GET /api/v1/health
```

Health check melakukan:

- PostgreSQL `SELECT 1`
- Redis `PING`

Jika PostgreSQL atau Redis belum berjalan, endpoint akan mengembalikan status unhealthy.

## Struktur Folder

```text
backend/api
|-- src
|   |-- app
|   |   |-- filters
|   |   `-- middleware
|   |-- infrastructure
|   |   |-- config
|   |   |-- database
|   |   `-- redis
|   |-- jobs
|   |-- modules
|   |   |-- auth
|   |   |-- health
|   |   |-- iam
|   |   `-- rbac
|   |-- shared
|   |   |-- constants
|   |   `-- types
|   `-- testing
|-- .env.example
|-- .prettierrc.json
|-- eslint.config.mjs
|-- nest-cli.json
|-- package.json
|-- tsconfig.build.json
`-- tsconfig.json
```

## Development Notes

- Semua route berada di bawah `API_PREFIX`.
- Setiap request menerima atau menghasilkan header `x-correlation-id`.
- Room master data alignment menambahkan `rooms.unit_code` untuk kode unit/kavling asli Excel dan `rooms.gender_policy` dengan nilai `male`, `female`, atau `mixed`.
- Default `rooms.gender_policy` adalah `mixed` agar data lama tetap valid tanpa memaksa asumsi Putra/Putri sebelum parsing master data.
- Mapping master data gender: `Putra`/`PUTRA` -> `male`, `Putri`/`PUTRI` -> `female`.
- Password plaintext tidak disimpan.
- Refresh token plaintext tidak disimpan.
- Permission guard memeriksa permission server-side, bukan route visibility frontend.
- `property_owner` seed hanya menerima permission read-only dan tidak mendapat Smart Lock, CCTV, Billing Management, Settings, atau mutation permission.
- Business module operasional dibuat pada milestone berikutnya.
