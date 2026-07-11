import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

export type AdminUxM1Fixture = {
  version: number;
  fixture_id: string;
  properties: Array<{
    id: string;
    code: string;
    rooms: Array<{
      id: string;
      code: string;
      status: string;
    }>;
  }>;
  actors: Array<{
    id: string;
    property_id: string;
    role: string;
    actor_code: string;
  }>;
  residents: Array<{
    id: string;
    property_id: string;
    resident_code: string;
    status: string;
  }>;
  legacy_invoices: Array<{
    id: string;
    property_id: string;
    room_id: string;
    invoice_code: string;
    status: string;
  }>;
  public_catalog: Array<{
    property_id: string;
    group_key: string;
    slug: string;
  }>;
  cross_property_denial: {
    source_property_id: string;
    target_property_id: string;
    expected_status: number;
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_ROLES = ['owner', 'manager', 'admin', 'property_owner', 'technician'];
const REQUIRED_ROOM_STATUSES = ['vacant', 'occupied', 'maintenance'];
const SENSITIVE_KEY = /(?:^|_)(?:nik|ktp|email|phone|address|storage(?:_path)?|token|secret|password)(?:_|$)/i;
const SENSITIVE_VALUE = /https?:\/\/|@|\b\d{16}\b/i;

export function adminUxM1FixturePath(): string {
  return resolve(__dirname, '../../../../../test/fixtures/admin-ux-m1-two-property.fixture.json');
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  return value;
}

function asUuid(value: unknown, label: string): string {
  const id = asString(value, label);
  if (!UUID_PATTERN.test(id)) {
    throw new Error(`${label} must be a UUID`);
  }
  return id;
}

function noDuplicate(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicates`);
  }
}

function parseFixture(value: unknown): AdminUxM1Fixture {
  const record = asRecord(value, 'fixture');
  const properties = asArray(record.properties, 'properties').map((item, index) => {
    const property = asRecord(item, `properties[${index}]`);
    return {
      id: asUuid(property.id, `properties[${index}].id`),
      code: asString(property.code, `properties[${index}].code`),
      rooms: asArray(property.rooms, `properties[${index}].rooms`).map((room, roomIndex) => {
        const roomRecord = asRecord(room, `properties[${index}].rooms[${roomIndex}]`);
        return {
          id: asUuid(roomRecord.id, `properties[${index}].rooms[${roomIndex}].id`),
          code: asString(roomRecord.code, `properties[${index}].rooms[${roomIndex}].code`),
          status: asString(roomRecord.status, `properties[${index}].rooms[${roomIndex}].status`),
        };
      }),
    };
  });
  const actors = asArray(record.actors, 'actors').map((item, index) => {
    const actor = asRecord(item, `actors[${index}]`);
    return {
      id: asUuid(actor.id, `actors[${index}].id`),
      property_id: asUuid(actor.property_id, `actors[${index}].property_id`),
      role: asString(actor.role, `actors[${index}].role`),
      actor_code: asString(actor.actor_code, `actors[${index}].actor_code`),
    };
  });
  const residents = asArray(record.residents, 'residents').map((item, index) => {
    const resident = asRecord(item, `residents[${index}]`);
    return {
      id: asUuid(resident.id, `residents[${index}].id`),
      property_id: asUuid(resident.property_id, `residents[${index}].property_id`),
      resident_code: asString(resident.resident_code, `residents[${index}].resident_code`),
      status: asString(resident.status, `residents[${index}].status`),
    };
  });
  const legacyInvoices = asArray(record.legacy_invoices, 'legacy_invoices').map((item, index) => {
    const invoice = asRecord(item, `legacy_invoices[${index}]`);
    return {
      id: asUuid(invoice.id, `legacy_invoices[${index}].id`),
      property_id: asUuid(invoice.property_id, `legacy_invoices[${index}].property_id`),
      room_id: asUuid(invoice.room_id, `legacy_invoices[${index}].room_id`),
      invoice_code: asString(invoice.invoice_code, `legacy_invoices[${index}].invoice_code`),
      status: asString(invoice.status, `legacy_invoices[${index}].status`),
    };
  });
  const publicCatalog = asArray(record.public_catalog, 'public_catalog').map((item, index) => {
    const catalog = asRecord(item, `public_catalog[${index}]`);
    return {
      property_id: asUuid(catalog.property_id, `public_catalog[${index}].property_id`),
      group_key: asString(catalog.group_key, `public_catalog[${index}].group_key`),
      slug: asString(catalog.slug, `public_catalog[${index}].slug`),
    };
  });
  const denial = asRecord(record.cross_property_denial, 'cross_property_denial');

  return {
    version: asNumber(record.version, 'version'),
    fixture_id: asString(record.fixture_id, 'fixture_id'),
    properties,
    actors,
    residents,
    legacy_invoices: legacyInvoices,
    public_catalog: publicCatalog,
    cross_property_denial: {
      source_property_id: asUuid(denial.source_property_id, 'cross_property_denial.source_property_id'),
      target_property_id: asUuid(denial.target_property_id, 'cross_property_denial.target_property_id'),
      expected_status: asNumber(denial.expected_status, 'cross_property_denial.expected_status'),
    },
  };
}

function assertNoPii(value: unknown, path = 'fixture'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPii(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, nestedValue] of Object.entries(value as JsonRecord)) {
      if (SENSITIVE_KEY.test(key)) {
        throw new Error(`${path}.${key} is not allowed in the synthetic fixture`);
      }
      assertNoPii(nestedValue, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && SENSITIVE_VALUE.test(value)) {
    throw new Error(`${path} resembles personal data, a URL, or a secret`);
  }
}

export async function loadAdminUxM1Fixture(): Promise<AdminUxM1Fixture> {
  const raw = await readFile(adminUxM1FixturePath(), 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  assertNoPii(parsed);
  return parseFixture(parsed);
}

export function validateAdminUxM1Fixture(fixture: AdminUxM1Fixture): Record<string, unknown> {
  if (fixture.version !== 1) {
    throw new Error('fixture version must equal 1');
  }
  if (fixture.properties.length !== 2) {
    throw new Error('fixture must contain exactly two properties');
  }

  const propertyIds = fixture.properties.map((property) => property.id);
  noDuplicate(propertyIds, 'property ids');
  noDuplicate(
    fixture.properties.map((property) => property.code),
    'property codes',
  );

  const propertyIdSet = new Set(propertyIds);
  const roomIds = new Set<string>();
  for (const property of fixture.properties) {
    noDuplicate(
      property.rooms.map((room) => room.id),
      `room ids for ${property.code}`,
    );
    const statuses = new Set(property.rooms.map((room) => room.status));
    for (const requiredStatus of REQUIRED_ROOM_STATUSES) {
      if (!statuses.has(requiredStatus)) {
        throw new Error(`${property.code} is missing ${requiredStatus} room coverage`);
      }
    }
    property.rooms.forEach((room) => roomIds.add(room.id));
  }

  for (const propertyId of propertyIds) {
    const roles = new Set(
      fixture.actors.filter((actor) => actor.property_id === propertyId).map((actor) => actor.role),
    );
    for (const role of REQUIRED_ROLES) {
      if (!roles.has(role)) {
        throw new Error(`property ${propertyId} is missing role fixture ${role}`);
      }
    }
  }

  for (const actor of fixture.actors) {
    if (!propertyIdSet.has(actor.property_id)) {
      throw new Error(`actor ${actor.actor_code} references an unknown property`);
    }
  }
  for (const resident of fixture.residents) {
    if (!propertyIdSet.has(resident.property_id)) {
      throw new Error(`resident ${resident.resident_code} references an unknown property`);
    }
  }
  for (const invoice of fixture.legacy_invoices) {
    if (!propertyIdSet.has(invoice.property_id) || !roomIds.has(invoice.room_id)) {
      throw new Error(`legacy invoice ${invoice.invoice_code} has an invalid property or room reference`);
    }
  }
  for (const catalog of fixture.public_catalog) {
    if (!propertyIdSet.has(catalog.property_id)) {
      throw new Error(`public catalog ${catalog.slug} references an unknown property`);
    }
  }

  const denial = fixture.cross_property_denial;
  if (
    denial.source_property_id === denial.target_property_id ||
    !propertyIdSet.has(denial.source_property_id) ||
    !propertyIdSet.has(denial.target_property_id) ||
    denial.expected_status !== 422
  ) {
    throw new Error('cross-property denial fixture must model a 422 between the two properties');
  }

  return {
    fixture_id: fixture.fixture_id,
    properties: fixture.properties.length,
    actors: fixture.actors.length,
    residents: fixture.residents.length,
    legacy_invoices: fixture.legacy_invoices.length,
    public_catalog_entries: fixture.public_catalog.length,
    pii_detected: false,
  };
}
