import { createHash } from 'node:crypto';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { databaseConfigFromEnv } from './database-url';

loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'backend/api/.env'),
    resolve(__dirname, '../../../../.env'),
    resolve(__dirname, '../../../.env'),
  ].find((path) => existsSync(path)),
});

type Category = 'rukost' | 'apartkost';
type Facility = { id: string; label: string; description: string; order: number };

const PROPERTY_ID = '20000000-0000-4000-8000-000000000001';
const EFFECTIVE_DATE = '2026-08-01';
const SEED_LOCK = 'kostation:kmo-demo-catalog:2026-08-01';

const CATEGORY_SEED: Record<
  Category,
  {
    asset: string;
    mime: 'image/jpeg';
    extension: 'jpg' | 'jpeg';
    width: number;
    height: number;
    sourceFileId: string;
    derivativeFileId: string;
    galleryId: string;
    facilityVersionId: string;
    galleryVersionId: string;
    alt: string;
    caption: string;
    facilities: Facility[];
  }
> = {
  rukost: {
    asset: 'rumahkost.jpeg',
    mime: 'image/jpeg',
    extension: 'jpeg',
    width: 715,
    height: 429,
    sourceFileId: 'd1010000-0000-4000-8000-000000000001',
    derivativeFileId: 'd1010000-0000-4000-8000-000000000002',
    galleryId: 'd1010000-0000-4000-8000-000000000003',
    facilityVersionId: 'd1010000-0000-4000-8000-000000000004',
    galleryVersionId: 'd1010000-0000-4000-8000-000000000005',
    alt: 'Kamar Rumah Kost Granada Student House',
    caption: 'Kamar praktis dan nyaman untuk rutinitas mahasiswa.',
    facilities: [
      {
        id: 'd1110000-0000-4000-8000-000000000001',
        label: 'Tempat tidur dan lemari',
        description: 'Perabot utama tersedia di setiap kamar Rumah Kost.',
        order: 0,
      },
      {
        id: 'd1110000-0000-4000-8000-000000000002',
        label: 'Meja belajar',
        description: 'Area belajar pribadi untuk kegiatan perkuliahan.',
        order: 1,
      },
      {
        id: 'd1110000-0000-4000-8000-000000000003',
        label: 'Kamar mandi dalam',
        description: 'Kamar mandi digunakan secara privat oleh penghuni kamar.',
        order: 2,
      },
      {
        id: 'd1110000-0000-4000-8000-000000000004',
        label: 'Wi-Fi',
        description: 'Akses internet untuk kebutuhan belajar dan komunikasi.',
        order: 3,
      },
      {
        id: 'd1110000-0000-4000-8000-000000000005',
        label: 'Area parkir',
        description: 'Parkir mengikuti ketersediaan dan pencatatan kendaraan.',
        order: 4,
      },
    ],
  },
  apartkost: {
    asset: 'apartkost.jpg',
    mime: 'image/jpeg',
    extension: 'jpg',
    width: 1280,
    height: 720,
    sourceFileId: 'd1020000-0000-4000-8000-000000000001',
    derivativeFileId: 'd1020000-0000-4000-8000-000000000002',
    galleryId: 'd1020000-0000-4000-8000-000000000003',
    facilityVersionId: 'd1020000-0000-4000-8000-000000000004',
    galleryVersionId: 'd1020000-0000-4000-8000-000000000005',
    alt: 'Kamar Apart Kost Granada Student House',
    caption: 'Ruang lebih lega dengan fasilitas mandiri untuk tinggal jangka panjang.',
    facilities: [
      {
        id: 'd1120000-0000-4000-8000-000000000001',
        label: 'Tempat tidur dan lemari',
        description: 'Perabot utama tersedia di setiap unit Apart Kost.',
        order: 0,
      },
      {
        id: 'd1120000-0000-4000-8000-000000000002',
        label: 'Area belajar',
        description: 'Ruang kerja dan belajar di dalam unit.',
        order: 1,
      },
      {
        id: 'd1120000-0000-4000-8000-000000000003',
        label: 'Kamar mandi dalam',
        description: 'Kamar mandi privat tersedia di dalam unit.',
        order: 2,
      },
      {
        id: 'd1120000-0000-4000-8000-000000000004',
        label: 'AC',
        description: 'Pendingin ruangan tersedia di dalam unit.',
        order: 3,
      },
      {
        id: 'd1120000-0000-4000-8000-000000000005',
        label: 'Pantry pribadi',
        description: 'Area pantry ringkas tersedia untuk kebutuhan harian.',
        order: 4,
      },
      {
        id: 'd1120000-0000-4000-8000-000000000006',
        label: 'Wi-Fi',
        description: 'Akses internet untuk kebutuhan belajar dan komunikasi.',
        order: 5,
      },
    ],
  },
};

const POLICY_ID = 'd1030000-0000-4000-8000-000000000001';
const RESIDENT_IDS = [
  'd1040000-0000-4000-8000-000000000001',
  'd1040000-0000-4000-8000-000000000002',
] as const;
const LEAD_IDS = [
  'd1050000-0000-4000-8000-000000000001',
  'd1050000-0000-4000-8000-000000000002',
  'd1050000-0000-4000-8000-000000000003',
] as const;

function rootAsset(name: string): string {
  return resolve(__dirname, '../seeds/assets', name);
}

function uploadRoot(): string {
  return resolve(process.cwd(), process.env.UPLOAD_STORAGE_PATH ?? './uploads');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureStoredCopy(
  assetPath: string,
  storagePath: string,
  createdPaths: string[],
): Promise<{ checksum: string; size: number }> {
  const source = await readFile(assetPath);
  const checksum = createHash('sha256').update(source).digest('hex');
  const absolute = resolve(uploadRoot(), ...storagePath.split('/'));
  await mkdir(dirname(absolute), { recursive: true });
  if (await exists(absolute)) {
    const current = await readFile(absolute);
    const currentChecksum = createHash('sha256').update(current).digest('hex');
    if (currentChecksum !== checksum)
      throw new Error(`Demo gallery file checksum drift: ${storagePath}`);
  } else {
    await writeFile(absolute, source, { flag: 'wx' });
    createdPaths.push(absolute);
  }
  return { checksum, size: source.length };
}

async function actorForProperty(client: PoolClient): Promise<string> {
  const actor = await client.query<{ id: string }>(
    `SELECT users.id
     FROM users
     JOIN user_property_roles membership ON membership.user_id = users.id
     JOIN roles role ON role.id = membership.role_id
     WHERE membership.property_id = $1 AND membership.revoked_at IS NULL
       AND role.code IN ('owner', 'manager', 'admin')
       AND users.user_status = 'active'
     ORDER BY CASE role.code WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, users.id
     LIMIT 1`,
    [PROPERTY_ID],
  );
  if (!actor.rows[0]) throw new Error('No active demo property operator is available.');
  return actor.rows[0].id;
}

async function ensureFileRow(
  client: PoolClient,
  input: {
    id: string;
    actorId: string;
    originalName: string;
    extension: string;
    mime: string;
    storagePath: string;
    checksum: string;
    size: number;
    width: number;
    height: number;
    publicSafe: boolean;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO files (
       id, property_id, uploader_user_id, original_filename, sanitized_filename,
       mime_type, file_extension, file_size_bytes, file_purpose, storage_driver,
       storage_path, checksum_sha256, metadata
     ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, 'hunian_gallery', 'local', $8, $9, $10::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      input.id,
      PROPERTY_ID,
      input.actorId,
      input.originalName,
      input.mime,
      input.extension,
      input.size,
      input.storagePath,
      input.checksum,
      JSON.stringify({
        detected_mime_type: input.mime,
        detected_extension: input.extension,
        width: input.width,
        height: input.height,
        public_safe_derivative: input.publicSafe,
      }),
    ],
  );
  const exact = await client.query(
    `SELECT 1 FROM files
     WHERE id = $1 AND property_id = $2 AND storage_path = $3
       AND checksum_sha256 = $4 AND is_deleted = false`,
    [input.id, PROPERTY_ID, input.storagePath, input.checksum],
  );
  if (exact.rowCount !== 1) throw new Error(`Demo file authority mismatch: ${input.id}`);
}

async function seedCategory(
  client: PoolClient,
  actorId: string,
  category: Category,
  kostTypeId: string,
  createdPaths: string[],
): Promise<void> {
  const seed = CATEGORY_SEED[category];
  for (const facility of seed.facilities) {
    await client.query(
      `INSERT INTO kost_type_content_facilities (
         id, property_id, kost_type_id, label, normalized_label, public_description,
         sort_order, content_state, public_visible, created_by_user_id, updated_by_user_id
       ) VALUES ($1, $2, $3, $4::text, lower(btrim($4::text)), $5, $6, 'active', true, $7, $7)
       ON CONFLICT DO NOTHING`,
      [
        facility.id,
        PROPERTY_ID,
        kostTypeId,
        facility.label,
        facility.description,
        facility.order,
        actorId,
      ],
    );
  }

  const assetPath = rootAsset(seed.asset);
  if (!(await exists(assetPath))) throw new Error(`Required demo asset is missing: ${seed.asset}`);
  const sourceStorage = `${PROPERTY_ID}/hunian_gallery/${seed.sourceFileId}.${seed.extension}`;
  const derivativeStorage = `${PROPERTY_ID}/hunian_gallery/${seed.derivativeFileId}.${seed.extension}`;
  const source = await ensureStoredCopy(assetPath, sourceStorage, createdPaths);
  const derivative = await ensureStoredCopy(assetPath, derivativeStorage, createdPaths);
  await ensureFileRow(client, {
    id: seed.sourceFileId,
    actorId,
    originalName: seed.asset,
    extension: seed.extension,
    mime: seed.mime,
    storagePath: sourceStorage,
    checksum: source.checksum,
    size: source.size,
    width: seed.width,
    height: seed.height,
    publicSafe: false,
  });
  await ensureFileRow(client, {
    id: seed.derivativeFileId,
    actorId,
    originalName: `public-${seed.asset}`,
    extension: seed.extension,
    mime: seed.mime,
    storagePath: derivativeStorage,
    checksum: derivative.checksum,
    size: derivative.size,
    width: seed.width,
    height: seed.height,
    publicSafe: true,
  });

  await client.query(
    `INSERT INTO hunian_gallery_images (
       id, property_id, file_id, alt_text, caption, sort_order, is_cover,
       public_visible, created_by, updated_by, target_type, kost_type_id,
       public_derivative_file_id, content_state
     ) VALUES ($1, $2, $3, $4, $5, 0, true, true, $6, $6, 'kost_type', $7, $8, 'draft')
     ON CONFLICT (id) DO NOTHING`,
    [
      seed.galleryId,
      PROPERTY_ID,
      seed.sourceFileId,
      seed.alt,
      seed.caption,
      actorId,
      kostTypeId,
      seed.derivativeFileId,
    ],
  );

  const facilityPayload = {
    items: seed.facilities.map((facility) => ({
      label: facility.label,
      public_description: facility.description,
      sort_order: facility.order,
    })),
  };
  const galleryPayload = {
    items: [
      {
        id: seed.galleryId,
        source_file_id: seed.sourceFileId,
        public_derivative_file_id: seed.derivativeFileId,
        alt_text: seed.alt,
        caption: seed.caption,
        sort_order: 0,
        is_cover: true,
      },
    ],
  };
  for (const version of [
    { id: seed.facilityVersionId, type: 'facilities', payload: facilityPayload },
    { id: seed.galleryVersionId, type: 'gallery', payload: galleryPayload },
  ]) {
    await client.query(
      `INSERT INTO kost_type_content_versions (
         id, property_id, kost_type_id, content_type, version, publication_status,
         effective_date, payload, published_by_user_id
       ) VALUES ($1, $2, $3, $4, 1, 'published', $5, $6::jsonb, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        version.id,
        PROPERTY_ID,
        kostTypeId,
        version.type,
        EFFECTIVE_DATE,
        JSON.stringify(version.payload),
        actorId,
      ],
    );
  }
}

async function seedPolicy(client: PoolClient, actorId: string): Promise<void> {
  const publicContent = {
    pricing_explanation:
      'Tarif Rumah Kost dan Apart Kost mengikuti kategori hunian: Rp1.800.000 per bulan atau Rp21.600.000 per tahun.',
    minimum_lease_term: 'Masa sewa minimum 12 bulan.',
    dp_explanation:
      'DP minimum 25% adalah pembayaran awal sewa dan diperhitungkan sebagai bagian pembayaran sewa.',
    security_deposit_explanation:
      'Security deposit sebesar satu bulan tarif disimpan terpisah sebagai dana jaminan dan bukan pendapatan sewa.',
    manual_payment_methods: ['Transfer bank', 'Tunai melalui Admin'],
    house_rules: [
      'Satu kamar dihuni oleh satu penghuni terdaftar.',
      'Hunian Putra dan Putri dipisahkan sesuai kebijakan kamar.',
      'Penghuni menjaga ketenangan, kebersihan, dan fasilitas bersama.',
      'Kendaraan wajib dicatatkan kepada Admin sebelum menggunakan area parkir.',
      'Pengajuan minat booking belum menjadi reservasi sampai dikonfirmasi Admin.',
    ],
    visitor_hours: '21:00',
    contact_information:
      'Admin Kostation akan menghubungi calon penyewa setelah formulir minat booking diterima.',
    category_applicability: ['rukost', 'apartkost'],
  };
  await client.query(
    `INSERT INTO property_policy_documents (
       id, property_id, document_type, version, publication_status, effective_date,
       internal_content, public_content, published_at, published_by_user_id,
       created_by_user_id, updated_by_user_id
     ) VALUES ($1, $2, 'public_terms', 2, 'published', $3, $4::jsonb, $5::jsonb,
       now(), $6, $6, $6)
     ON CONFLICT (id) DO NOTHING`,
    [
      POLICY_ID,
      PROPERTY_ID,
      EFFECTIVE_DATE,
      JSON.stringify({
        operating_policy: 'Demo publication aligned to the approved KMO public authority.',
      }),
      JSON.stringify(publicContent),
      actorId,
    ],
  );
}

async function seedResidents(client: PoolClient, actorId: string): Promise<void> {
  const residents = [
    {
      id: RESIDENT_IDS[0],
      name: 'Nadia Putri Ramadhani',
      phone: '6281291002001',
      email: 'nadia.demo@kostation.test',
      ktp: '3201014408050001',
      gender: 'female',
      birthDate: '2005-08-04',
      faculty: 'Ilmu Komunikasi',
      major: 'Manajemen Komunikasi',
      cohort: '2024',
    },
    {
      id: RESIDENT_IDS[1],
      name: 'Raka Aditya Pratama',
      phone: '6281291002002',
      email: 'raka.demo@kostation.test',
      ktp: '3201011206040002',
      gender: 'male',
      birthDate: '2004-06-12',
      faculty: 'Teknik Geologi',
      major: 'Teknik Geologi',
      cohort: '2023',
    },
  ];
  for (const resident of residents) {
    await client.query(
      `INSERT INTO residents (
         id, property_id, full_name, phone, email, ktp_number, gender,
         resident_status, date_of_birth, place_of_birth, address, emergency_phone,
         university, faculty, major, cohort, instagram, parent_name, parent_phone,
         marital_status, created_by_user_id, updated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_activation', $8, 'Bandung',
         'Jatinangor, Sumedang', '6281291999000', 'Universitas Padjadjaran', $9, $10,
         $11, NULL, 'Orang Tua/Wali Demo', '6281291888000', 'single', $12, $12)
       ON CONFLICT (id) DO NOTHING`,
      [
        resident.id,
        PROPERTY_ID,
        resident.name,
        resident.phone,
        resident.email,
        resident.ktp,
        resident.gender,
        resident.birthDate,
        resident.faculty,
        resident.major,
        resident.cohort,
        actorId,
      ],
    );
  }
}

async function seedBookingLeads(client: PoolClient, actorId: string): Promise<void> {
  const vacantRooms = await client.query<{ id: string; category: Category; gender_policy: string }>(
    `SELECT id, category, gender_policy
     FROM rooms
     WHERE property_id = $1 AND room_status = 'vacant'
       AND public_visible = true AND category = 'rukost' AND gender_policy = 'male'
     ORDER BY number, id
     LIMIT 1`,
    [PROPERTY_ID],
  );
  const room = vacantRooms.rows[0] ?? null;
  const leads = [
    {
      id: LEAD_IDS[0],
      source: 'public_kamar',
      category: 'apartkost',
      gender: 'female',
      name: 'Alya Maharani',
      phone: '6281292003001',
      email: 'alya.booking@kostation.test',
      university: 'Universitas Padjadjaran',
      status: 'new',
      roomId: null,
      createdBy: null,
      message: 'Mencari Apart Kost Putri untuk awal tahun ajaran.',
    },
    {
      id: LEAD_IDS[1],
      source: 'public_kamar',
      category: 'rukost',
      gender: 'male',
      name: 'Dimas Prakoso',
      phone: '6281292003002',
      email: 'dimas.booking@kostation.test',
      university: 'Institut Teknologi Bandung',
      status: 'negotiating',
      roomId: null,
      createdBy: null,
      message: 'Memerlukan informasi pembayaran tahunan Rumah Kost.',
    },
    {
      id: LEAD_IDS[2],
      source: 'admin_quick_entry',
      category: 'rukost',
      gender: 'male',
      name: 'Fajar Nugraha',
      phone: '6281292003003',
      email: 'fajar.booking@kostation.test',
      university: 'Universitas Padjadjaran',
      status: 'contacted',
      roomId: room?.id ?? null,
      createdBy: actorId,
      message: 'Dicatat Admin setelah kunjungan langsung.',
    },
  ] as const;
  for (const lead of leads) {
    await client.query(
      `INSERT INTO booking_leads (
         id, property_id, category, gender, public_group_key, visitor_name,
         visitor_phone, visitor_email, visitor_university, visitor_message,
         preferred_move_in_date, status, source, room_id, created_by_user_id,
         consent_at, consent_version, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         DATE '2026-08-15', $11, $12, $13, $14,
         CASE WHEN $12 = 'public_kamar' THEN now() ELSE NULL END,
         CASE WHEN $12 = 'public_kamar' THEN 'public-lead-v1' ELSE NULL END,
         $15::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        lead.id,
        PROPERTY_ID,
        lead.category,
        lead.gender,
        `${lead.category}:${lead.gender}`,
        lead.name,
        lead.phone,
        lead.email,
        lead.university,
        lead.message,
        lead.status,
        lead.source,
        lead.roomId,
        lead.createdBy,
        JSON.stringify({ demo_seed: 'kmo-w00-w06', payment_schedule: 'annual' }),
      ],
    );
  }
}

async function validate(client: PoolClient): Promise<Record<string, number>> {
  const result = await client.query<Record<string, number>>(
    `SELECT
       (SELECT count(*)::int FROM kost_type_content_facilities WHERE id::text LIKE 'd11%') AS facilities,
       (SELECT count(*)::int FROM kost_type_content_versions WHERE id::text LIKE 'd10%') AS publications,
       (SELECT count(*)::int FROM property_policy_documents WHERE id = $1 AND publication_status = 'published') AS policies,
       (SELECT count(*)::int FROM hunian_gallery_images WHERE id::text LIKE 'd10%') AS gallery,
       (SELECT count(*)::int FROM residents WHERE id = ANY($2::uuid[])) AS residents,
       (SELECT count(*)::int FROM booking_leads WHERE id = ANY($3::uuid[])) AS booking_leads`,
    [POLICY_ID, [...RESIDENT_IDS], [...LEAD_IDS]],
  );
  const counts = result.rows[0];
  if (
    !counts ||
    counts.facilities !== 11 ||
    counts.publications !== 4 ||
    counts.policies !== 1 ||
    counts.gallery !== 2 ||
    counts.residents !== 2 ||
    counts.booking_leads !== 3
  ) {
    throw new Error(`KMO demo seed validation failed: ${JSON.stringify(counts)}`);
  }
  return counts;
}

async function main(): Promise<void> {
  if ((process.env.NODE_ENV ?? 'development') !== 'development' || process.env.DB_SSL === 'true') {
    throw new Error('KMO demo seed is restricted to development with DB_SSL=false.');
  }
  const pool = new Pool(databaseConfigFromEnv());
  const client = await pool.connect();
  const createdPaths: string[] = [];
  try {
    const identity = await client.query<{ database: string }>(
      'SELECT current_database() AS database',
    );
    if (identity.rows[0]?.database !== 'kostation_demo_pg3') {
      throw new Error('KMO demo seed target must be exact canonical development database.');
    }
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [SEED_LOCK]);
    const property = await client.query(
      `SELECT property.id
       FROM properties property
       WHERE property.id = $1 AND property.status = 'active'
         AND (SELECT count(*) FROM kost_types type WHERE type.property_id = property.id
           AND type.status = 'active' AND type.deleted_at IS NULL) = 2
       FOR UPDATE`,
      [PROPERTY_ID],
    );
    if (property.rowCount !== 1)
      throw new Error('Canonical demo property authority is unavailable.');
    const actorId = await actorForProperty(client);
    const types = await client.query<{ id: string; category: Category }>(
      `SELECT id, category FROM kost_types
       WHERE property_id = $1 AND status = 'active' AND deleted_at IS NULL
       ORDER BY category FOR UPDATE`,
      [PROPERTY_ID],
    );
    if (types.rows.length !== 2)
      throw new Error('Exactly two canonical kost categories are required.');
    for (const type of types.rows) {
      if (type.category !== 'rukost' && type.category !== 'apartkost') {
        throw new Error('Unexpected kost category.');
      }
      await seedCategory(client, actorId, type.category, type.id, createdPaths);
    }
    await seedPolicy(client, actorId);
    await seedResidents(client, actorId);
    await seedBookingLeads(client, actorId);
    const counts = await validate(client);
    await client.query('COMMIT');
    console.log('KMO demo seed applied safely.');
    for (const [name, count] of Object.entries(counts)) console.log(`${name}: ${count}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    for (const path of createdPaths) await unlink(path).catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
