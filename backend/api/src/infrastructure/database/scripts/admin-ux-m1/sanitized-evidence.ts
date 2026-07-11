import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s'"`]+/giu;
const BEARER_TOKEN_PATTERN = /(bearer\s+)[^\s'"`]+/giu;
const ASSIGNMENT_SECRET_PATTERN = /((?:token|secret|password|authorization)\s*[=:]\s*)[^\s,;]+/giu;

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sanitizeEvidenceText(value: string): string {
  return value
    .replace(DATABASE_URL_PATTERN, '[redacted-database-url]')
    .replace(BEARER_TOKEN_PATTERN, '$1[redacted]')
    .replace(ASSIGNMENT_SECRET_PATTERN, '$1[redacted]');
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeEvidenceText(error.message);
  }
  return 'Unexpected non-Error failure';
}

export function defaultEvidencePath(reportName: string): string {
  const directory = process.env.ADMIN_UX_QA_REPORT_DIR?.trim() || '/tmp/granada-kost-admin-ux-m1';
  return resolve(directory, reportName);
}

export async function writeSanitizedEvidence(
  reportPath: string,
  report: Record<string, unknown>,
): Promise<string> {
  const resolvedPath = resolve(reportPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return resolvedPath;
}
