import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AdminUxM1Fixture } from './admin-ux-m1-fixtures';

type JsonRecord = Record<string, unknown>;

export type ContractSuite = 'legacy' | 'public';

export type ContractEndpoint = {
  id: string;
  method: 'GET';
  path: string;
  query: Record<string, string>;
  requires_auth: boolean;
  expected_status: number;
  response_type: 'object' | 'array';
};

export type AdminUxContractBaseline = {
  version: number;
  baseline_id: string;
  source_commit: string;
  forbidden_response_key_fragments: string[];
  suites: Record<ContractSuite, ContractEndpoint[]>;
};

export function adminUxM1ContractBaselinePath(): string {
  return resolve(__dirname, '../../../../../test/fixtures/admin-ux-m1-contract-baseline.json');
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

function parseEndpoint(value: unknown, label: string): ContractEndpoint {
  const record = asRecord(value, label);
  const method = asString(record.method, `${label}.method`);
  const responseType = asString(record.response_type, `${label}.response_type`);
  const queryRecord = asRecord(record.query ?? {}, `${label}.query`);
  const query = Object.fromEntries(
    Object.entries(queryRecord).map(([key, queryValue]) => [
      key,
      asString(queryValue, `${label}.query.${key}`),
    ]),
  );

  if (method !== 'GET') {
    throw new Error(`${label}.method must be GET in the M1 read-only baseline`);
  }
  if (responseType !== 'object' && responseType !== 'array') {
    throw new Error(`${label}.response_type must be object or array`);
  }
  const path = asString(record.path, `${label}.path`);
  if (!path.startsWith('/api/v1/')) {
    throw new Error(`${label}.path must stay under /api/v1/`);
  }
  const expectedStatus = asNumber(record.expected_status, `${label}.expected_status`);
  if (expectedStatus < 200 || expectedStatus >= 300) {
    throw new Error(`${label}.expected_status must be a successful HTTP status`);
  }

  return {
    id: asString(record.id, `${label}.id`),
    method,
    path,
    query,
    requires_auth: record.requires_auth === true,
    expected_status: expectedStatus,
    response_type: responseType,
  };
}

export async function loadAdminUxContractBaseline(): Promise<AdminUxContractBaseline> {
  const raw = await readFile(adminUxM1ContractBaselinePath(), 'utf8');
  const record = asRecord(JSON.parse(raw) as unknown, 'contract baseline');
  const suites = asRecord(record.suites, 'suites');
  const parsedSuites = {
    legacy: asArray(suites.legacy, 'suites.legacy').map((entry, index) =>
      parseEndpoint(entry, `suites.legacy[${index}]`),
    ),
    public: asArray(suites.public, 'suites.public').map((entry, index) =>
      parseEndpoint(entry, `suites.public[${index}]`),
    ),
  };
  const baseline: AdminUxContractBaseline = {
    version: asNumber(record.version, 'version'),
    baseline_id: asString(record.baseline_id, 'baseline_id'),
    source_commit: asString(record.source_commit, 'source_commit'),
    forbidden_response_key_fragments: asArray(
      record.forbidden_response_key_fragments,
      'forbidden_response_key_fragments',
    ).map((fragment, index) =>
      asString(fragment, `forbidden_response_key_fragments[${index}]`).toLowerCase(),
    ),
    suites: parsedSuites,
  };
  validateAdminUxContractBaseline(baseline);
  return baseline;
}

export function validateAdminUxContractBaseline(baseline: AdminUxContractBaseline): void {
  if (baseline.version !== 1) {
    throw new Error('contract baseline version must equal 1');
  }
  if (baseline.source_commit !== '404f722') {
    throw new Error('contract baseline must remain anchored to the M0 PASS commit');
  }
  if (baseline.forbidden_response_key_fragments.length === 0) {
    throw new Error('contract baseline must include PII leak-scan key fragments');
  }

  const endpointIds = new Set<string>();
  for (const suite of ['legacy', 'public'] as const) {
    if (baseline.suites[suite].length === 0) {
      throw new Error(`${suite} contract baseline must not be empty`);
    }
    for (const endpoint of baseline.suites[suite]) {
      if (endpointIds.has(endpoint.id)) {
        throw new Error(`contract endpoint id ${endpoint.id} is duplicated`);
      }
      endpointIds.add(endpoint.id);
      if (suite === 'public' && endpoint.requires_auth) {
        throw new Error(`public endpoint ${endpoint.id} must remain unauthenticated`);
      }
    }
  }
}

export function contractTemplateContext(fixture: AdminUxM1Fixture): Record<string, string> {
  const [propertyAlpha, propertyBeta] = fixture.properties;
  if (!propertyAlpha || !propertyBeta) {
    throw new Error('two-property fixture is required for the contract template context');
  }
  const alphaVacantRoom = propertyAlpha.rooms.find((room) => room.status === 'vacant');
  const alphaCatalog = fixture.public_catalog.find(
    (entry) => entry.property_id === propertyAlpha.id,
  );
  if (!alphaVacantRoom || !alphaCatalog) {
    throw new Error('fixture must provide a property-alpha vacant room and public catalog entry');
  }

  return {
    property_alpha_id: propertyAlpha.id,
    property_beta_id: propertyBeta.id,
    property_alpha_room_vacant_id: alphaVacantRoom.id,
    public_group_key: alphaCatalog.group_key,
    public_catalog_slug: alphaCatalog.slug,
  };
}

export function expandContractTemplate(
  value: string,
  context: Record<string, string>,
): string {
  return value.replace(/\{([a-z0-9_]+)\}/gi, (placeholder, key: string) => {
    const replacement = context[key];
    if (!replacement) {
      throw new Error(`contract placeholder ${placeholder} has no fixture value`);
    }
    return replacement;
  });
}

export function assertNoForbiddenResponseKeys(
  value: unknown,
  forbiddenFragments: string[],
  path = '$',
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenResponseKeys(item, forbiddenFragments, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, nestedValue] of Object.entries(value as JsonRecord)) {
    const lowerCaseKey = key.toLowerCase();
    if (forbiddenFragments.some((fragment) => lowerCaseKey.includes(fragment))) {
      throw new Error(`response contains forbidden key at ${path}.${key}`);
    }
    assertNoForbiddenResponseKeys(nestedValue, forbiddenFragments, `${path}.${key}`);
  }
}
