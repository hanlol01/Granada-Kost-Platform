# Domain Docs

This repository uses a multi-context layout because one shared business domain
is consumed by multiple applications and services.

## Before Exploring or Implementing

1. Read `CONTEXT-MAP.md` at the repository root.
2. Read every context linked by the map that is relevant to the assigned work.
3. Read system-wide ADRs in `docs/adr/` that touch the assigned area.
4. Follow more detailed references linked from the selected context.

Missing optional context or ADR directories are not blockers. Domain-modeling
work creates them only when a canonical term or durable decision needs to be
recorded.

## Current Layout

```text
/
├── CONTEXT-MAP.md
├── docs/
│   ├── agents/
│   │   ├── domain.md
│   │   └── issue-tracker.md
│   ├── adr/
│   └── 21-kost-management-ecosystem-overhaul/
│       └── CONTEXT.md
├── apps/
│   ├── admin/
│   └── penghuni/
├── backend/
│   └── api/
└── packages/
```

The context map is the entry point. Do not create competing glossaries inside
individual applications unless a genuinely separate bounded context is later
identified.

## Vocabulary and Decisions

- Use the canonical terms defined by the selected `CONTEXT.md` in issue titles,
  specifications, tests, UI copy, API contracts, and implementation notes.
- Surface conflicts with an existing ADR explicitly. A new decision may
  supersede an ADR only through another ADR.
- Keep `CONTEXT.md` limited to domain language. Put implementation sequences and
  acceptance criteria in specifications or handoff documents.

