import {
  assertNoForbiddenResponseKeys,
  ContractEndpoint,
  ContractSuite,
  contractTemplateContext,
  expandContractTemplate,
  loadAdminUxContractBaseline,
} from './admin-ux-contract-baseline';
import { loadAdminUxM1Fixture } from './admin-ux-m1-fixtures';
import {
  defaultEvidencePath,
  safeErrorMessage,
  writeSanitizedEvidence,
} from './sanitized-evidence';

const DEFAULT_ALLOWED_API_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const FORBIDDEN_TARGET_TERM = /(^|[._-])(prod(?:uction)?|stage|staging|live)([._-]|$)/i;

type ApiTarget = {
  baseUrl: URL;
  host: string;
  port: string;
};

function normalizedHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function parseSuite(args: string[]): ContractSuite {
  const argument = args.find((value) => value.startsWith('--suite='));
  const suite = argument?.slice('--suite='.length);
  if (suite !== 'legacy' && suite !== 'public') {
    throw new Error('Usage: run-contract-baseline.ts --suite=legacy|public');
  }
  return suite;
}

function disposableApiTargetFromEnv(environment: NodeJS.ProcessEnv = process.env): ApiTarget {
  if (environment.ADMIN_UX_QA_DISPOSABLE?.trim() !== 'true') {
    throw new Error('ADMIN_UX_QA_DISPOSABLE=true is required for contract baseline requests');
  }
  const nodeEnvironment = environment.NODE_ENV?.trim().toLowerCase();
  if (nodeEnvironment === 'production' || nodeEnvironment === 'staging') {
    throw new Error('Contract baseline requests refuse NODE_ENV production or staging');
  }
  const rawBaseUrl = environment.API_BASE_URL?.trim();
  if (!rawBaseUrl) {
    throw new Error('API_BASE_URL is required for contract baseline requests');
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error('API_BASE_URL must be a valid HTTP URL');
  }
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new Error('API_BASE_URL must use http or https');
  }

  const host = normalizedHost(baseUrl.hostname);
  if (FORBIDDEN_TARGET_TERM.test(host)) {
    throw new Error('Contract baseline requests refuse production or staging-like hosts');
  }
  const configuredHosts = (environment.ADMIN_UX_QA_ALLOWED_API_HOSTS ?? '')
    .split(',')
    .filter((value) => value.trim() !== '')
    .map(normalizedHost);
  const allowedHosts = new Set([...DEFAULT_ALLOWED_API_HOSTS, ...configuredHosts]);
  if (!allowedHosts.has(host)) {
    throw new Error('API_BASE_URL host is not an approved disposable host');
  }

  return { baseUrl, host, port: baseUrl.port || (baseUrl.protocol === 'https:' ? '443' : '80') };
}

function requestUrl(
  endpoint: ContractEndpoint,
  baseUrl: URL,
  context: Record<string, string>,
): URL {
  const url = new URL(expandContractTemplate(endpoint.path, context), baseUrl);
  for (const [key, value] of Object.entries(endpoint.query)) {
    url.searchParams.set(key, expandContractTemplate(value, context));
  }
  return url;
}

async function runEndpoint(
  endpoint: ContractEndpoint,
  target: ApiTarget,
  context: Record<string, string>,
  authToken: string | undefined,
  forbiddenResponseKeyFragments: string[],
): Promise<{ id: string; status: number }> {
  if (endpoint.requires_auth && !authToken) {
    throw new Error(`ADMIN_UX_QA_AUTH_TOKEN is required for ${endpoint.id}`);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Correlation-Id': `admin-ux-m1-${endpoint.id}`,
  };
  if (endpoint.requires_auth && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(requestUrl(endpoint, target.baseUrl, context), {
    method: endpoint.method,
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== endpoint.expected_status) {
    throw new Error(`${endpoint.id} expected HTTP ${endpoint.expected_status}, received ${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`${endpoint.id} did not return application/json`);
  }

  const body = (await response.json()) as unknown;
  if (endpoint.response_type === 'array' ? !Array.isArray(body) : Array.isArray(body) || typeof body !== 'object' || body === null) {
    throw new Error(`${endpoint.id} no longer matches the ${endpoint.response_type} response baseline`);
  }
  assertNoForbiddenResponseKeys(body, forbiddenResponseKeyFragments);
  return { id: endpoint.id, status: response.status };
}

async function main(): Promise<void> {
  const suite = parseSuite(process.argv.slice(2));
  const target = disposableApiTargetFromEnv();
  const [fixture, baseline] = await Promise.all([
    loadAdminUxM1Fixture(),
    loadAdminUxContractBaseline(),
  ]);
  const authToken = process.env.ADMIN_UX_QA_AUTH_TOKEN?.trim() || undefined;
  const context = contractTemplateContext(fixture);
  const results: Array<{ id: string; status: number }> = [];

  for (const endpoint of baseline.suites[suite]) {
    results.push(
      await runEndpoint(
        endpoint,
        target,
        context,
        authToken,
        baseline.forbidden_response_key_fragments,
      ),
    );
  }

  const reportPath = await writeSanitizedEvidence(defaultEvidencePath(`contract-${suite}.json`), {
    gate: `admin-ux-m1-contract-${suite}`,
    passed: true,
    target: { host: target.host, port: target.port },
    endpoint_results: results,
  });
  console.log(
    JSON.stringify({
      gate: `admin-ux-m1-contract-${suite}`,
      passed: true,
      endpoint_count: results.length,
      report_path: reportPath,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(`Admin UX M1 contract baseline failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
