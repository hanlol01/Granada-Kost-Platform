import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function source(...segments: string[]): string {
  return readFileSync(resolve(HERE, '../../src', ...segments), 'utf8');
}

test('owner-sponsored onboarding accepts the active permanent asset owner without a lease-date gate', () => {
  const onboarding = source('modules/resident/onboarding.service.ts');
  const start = onboarding.indexOf('const ownerSponsorshipAssignment');
  const end = onboarding.indexOf('const identityPhone', start);
  const sponsorshipAuthority = onboarding.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(sponsorshipAuthority, /assignment\.assignment_status='active'/);
  assert.doesNotMatch(sponsorshipAuthority, /effective_from|effective_until|\$3::date/);
  assert.match(
    sponsorshipAuthority,
    /Owner penanggung tidak sesuai dengan owner aset yang terdaftar/,
  );
});

test('asset choices use active ownership registration rather than an effective-date request', () => {
  const service = source('modules/property-owner-management/property-owner-management.service.ts');
  const start = service.indexOf('async assetOptions');
  const end = service.indexOf('async create', start);
  const assetOptions = service.slice(start, end);
  const dto = source('modules/property-owner-management/dto/property-owner-management.dto.ts');

  assert.ok(start >= 0 && end > start);
  assert.equal((assetOptions.match(/assignments\.assignment_status = 'active'/g) ?? []).length, 2);
  assert.doesNotMatch(assetOptions, /effective_from|effective_until|next_assignment|\$2::date/);
  assert.match(
    dto,
    /class PropertyOwnerAssetOptionsQueryDto extends PropertyOwnerPropertyQueryDto \{\}/,
  );
  assert.doesNotMatch(dto, /effective_date\?: string/);
});

test('asset options expose the lateral assignment timestamp used by the building aggregate', () => {
  const service = source('modules/property-owner-management/property-owner-management.service.ts');
  const start = service.indexOf('async assetOptions');
  const end = service.indexOf('async create', start);
  const assetOptions = service.slice(start, end);
  const buildingLateralStart = assetOptions.indexOf(
    'SELECT assignments.id, assignments.owner_profile_id, profiles.full_name AS owner_name',
  );
  const buildingLateralFrom = assetOptions.indexOf(
    'FROM building_owner_assignments assignments',
    buildingLateralStart,
  );
  const buildingProjection = assetOptions.slice(buildingLateralStart, buildingLateralFrom);

  assert.ok(buildingLateralStart >= 0 && buildingLateralFrom > buildingLateralStart);
  assert.match(assetOptions, /GROUP BY[\s\S]*assignment\.updated_at/);
  assert.match(buildingProjection, /assignments\.updated_at AS updated_at/);
});

test('owner portal operational access uses active registration, while finance remains historical', () => {
  const portal = source('modules/property-owner-management/property-owner-portal.service.ts');
  const start = portal.indexOf('async getPortal');
  const end = portal.indexOf('async buildReport', start);
  const operationalPortal = portal.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(operationalPortal, /assignment_status = 'active'/);
  assert.doesNotMatch(
    operationalPortal,
    /effective_from\s*<=\s*\(CURRENT_TIMESTAMP AT TIME ZONE 'Asia\/Jakarta'\)::date/,
  );
  assert.doesNotMatch(operationalPortal, /effective_until IS NULL OR/);
});

test('owner-sponsored onboarding does not require a historical payment date without an initial payment', () => {
  const onboarding = source('modules/resident/onboarding.service.ts');
  const start = onboarding.indexOf("if (\n          commercialMode !== 'owner_sponsored'");
  const end = onboarding.indexOf('const rentPayments', start);
  const paymentDateGuard = onboarding.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(paymentDateGuard, /commercialMode !== 'owner_sponsored'/);
  assert.match(paymentDateGuard, /PAYMENT_PAID_AT_REQUIRED/);
});
