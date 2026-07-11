# Admin UX — M1 QA/Release Foundation Evidence

> **Status:** M1 foundation. This work adds no product schema, business endpoint,
> UI, or staging/production data mutation.

## Delivered scope

- A fail-closed disposable-database guard for M1 database commands.
- A TypeScript test runner based on the existing `tsx` dependency and Node's
  built-in test runner; no dependency or lockfile change is needed.
- A read-only legacy/public contract baseline anchored to M0 commit `404f722`.
- A migration verifier that runs the current all-SQL migration behavior twice,
  then compares schema and business-data fingerprints.
- A synthetic two-property fixture with role, room-state, legacy-invoice,
  public-catalog, and cross-property-denial coverage. It contains no personal
  names, addresses, contacts, NIK/KTP, file paths, URLs, tokens, or credentials.
- An aggregate release gate that emits sanitized evidence only.

## Commands

The M1 commands are provided by the dedicated QA workspace:

```sh
npm --workspace @granada-kost/admin-ux-qa run test
npm --workspace @granada-kost/admin-ux-qa run fixture:validate
```

Before a database command can connect, it requires all of the following:

1. Explicit `DATABASE_URL` naming a single database ending in `_m1_qa` or
   `_m1_qa_<suffix>`.
2. `ADMIN_UX_QA_DISPOSABLE=true` exactly.
3. `NODE_ENV` that is neither `production` nor `staging`.
4. A localhost target by default. CI service hosts require the explicit
   `ADMIN_UX_QA_ALLOWED_HOSTS` allowlist, while production/staging-like names
   remain refused.

The verifier never provisions, drops, truncates, resets, or backfills a
database. Provision a clean disposable database externally, then run:

```sh
ADMIN_UX_QA_DISPOSABLE=true NODE_ENV=test DATABASE_URL="$DATABASE_URL" \
npm --workspace @granada-kost/admin-ux-qa run db:qa:guard

ADMIN_UX_QA_DISPOSABLE=true NODE_ENV=test DATABASE_URL="$DATABASE_URL" \
npm --workspace @granada-kost/admin-ux-qa run db:migrate:verify
```

For a containerized CI service, set an explicit host allowlist such as
`ADMIN_UX_QA_ALLOWED_HOSTS=postgres`. This does not bypass database-name,
marker, or production/staging checks.

Run HTTP baseline checks only against an API connected to the synthetic
disposable fixture. `ADMIN_UX_QA_AUTH_TOKEN` is used only by the legacy suite
and is never printed or retained in evidence.

```sh
ADMIN_UX_QA_DISPOSABLE=true NODE_ENV=test API_BASE_URL="$API_BASE_URL" \
ADMIN_UX_QA_AUTH_TOKEN="$ADMIN_UX_QA_AUTH_TOKEN" \
npm --workspace @granada-kost/admin-ux-qa run test:contract:legacy

ADMIN_UX_QA_DISPOSABLE=true NODE_ENV=test API_BASE_URL="$API_BASE_URL" \
npm --workspace @granada-kost/admin-ux-qa run test:contract:public
```

The aggregate gate is:

```sh
npm --workspace @granada-kost/admin-ux-qa run verify:admin-ux
```

It deliberately fails closed when disposable database/API variables are absent,
rather than silently skipping migration or contract evidence.

## Sanitized evidence

By default, reports are written below `/tmp/granada-kost-admin-ux-m1/`; set
`ADMIN_UX_QA_REPORT_DIR` to select another local artifact directory. Reports
contain only command IDs, statuses, durations, sanitized target metadata,
fingerprints, table counts, and SHA-256 hashes of sanitized output. Raw response
bodies, database URLs, tokens, credentials, NIK/KTP, storage paths, and raw
command output are excluded.

The generated report names are `release-gate.json`, `migration-verify.json`,
`contract-legacy.json`, and `contract-public.json`.
