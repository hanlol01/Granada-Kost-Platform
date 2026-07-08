# M20 - Staging Restart & Visual QA Pass (M20A Plan / Checklist)

> Date: 2026-07-08
> Scope: Documentation/checklist only. No application source code changes, no new features, no migrations authored, no DB mutation by this pass.
> Validation: NO lint/build/API/browser validation executed or claimed in this pass. Execution of the checklists below is external (operator and/or Codex shell/browser executor), per the established agent role split.
> Posture: **M20 does NOT claim production readiness.** Public booking remains NOT production-ready; payment booking deferred; Payment Gateway sandbox/staging only; Smart Lock live command NO-GO (`SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`).

## 1. Milestone Purpose

M20 closes today's revision cycle (M18 Public Hunian Catalog + M19 Hunian Gallery) by validating **deployment/staging/demo readiness** - not by adding features. It directly addresses the two accepted M19 QA limitations:

1. **Stale API process**: parts of M19C/M19D QA live smoke ran against a stale port 3000 process (fresh startup was blocked); the M19B fresh smoke on port 3001 did pass. M20 requires a fresh restart of the staging API so the M18/M19 routes are verifiably active.
2. **No browser visual QA**: the VPS has no browser tooling; visual QA has never run for the M16C/M16E/M17C/M17D/M19C/M19D surfaces. M20 defines an optional local browser visual QA pass.

M20 is the **final milestone for today's revision cycle**. Outcome is a recorded verdict (Section 11), not new capability.

## 2. Scope

**Included:**

- API restart / deployment smoke
- Migration check (through `015_hunian_gallery.sql`)
- Upload storage check
- Admin app build/deploy check
- Public/penghuni app build/deploy check
- API smoke (M18 catalog + M19 gallery + key regressions)
- Admin gallery smoke
- Public catalog/gallery smoke
- Optional local browser visual QA

**Excluded (binding):**

- No new feature of any kind
- No payment booking
- No exact room selection
- No video gallery
- No thumbnail pipeline
- No public upload
- No Smart Lock live command
- No new admin features; no new gallery features

## 3. Deployment / Restart Checklist

| # | Step | Expected / Evidence |
| --- | --- | --- |
| D1 | Pull latest `master` on the VPS (must include merged M19C/M19D code and M19E docs) | Record deployed commit SHA |
| D2 | Install dependencies if lockfile changed (`npm install` from repo root) | No install errors |
| D3 | Apply migrations: `npm run db:migrate:api` | Migration `015_hunian_gallery.sql` applied (runner replay-safe; re-run is a no-op) |
| D4 | Rebuild API (`npm run build:api`) and **restart the API service (systemd)** | New process start time recorded; stale port 3000 process replaced |
| D5 | Verify API health: `GET /api/v1/health` | 200; database up; Redis up |
| D6 | Redeploy admin app (`apps/admin` build -> `https://kelola.kostation.web.id`) | New bundle served (asset hash changed) |
| D7 | Redeploy penghuni/public app (`apps/penghuni` build -> `https://app.kostation.web.id`) | New bundle served (asset hash changed) |
| D8 | Ensure `VITE_API_BASE_URL` correct in both frontend builds (staging: `https://api.kostation.web.id/api/v1`) | Public media URLs resolve to the API origin |
| D9 | Ensure `VITE_PUBLIC_WHATSAPP_NUMBER` set (or accept the safe disabled-CTA fallback) | CTA renders with prefilled `wa.me` OR safe disabled copy |
| D10 | Ensure upload storage directory exists, is writable by the API user, and is outside the web root | Write test via an admin upload (Section 5) |
| D11 | Ensure file serving / public media endpoint works: `GET /api/v1/public/hunian-gallery/:id/content` for a published sample | 200, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff` |
| D12 | If stale assets appear in the browser, clear CDN/browser cache and rebuild frontend | Fresh bundles confirmed |

## 4. API Smoke Checklist

Run against the freshly restarted staging API. Items marked *(if sample/token available)* are conditional; record SKIPPED with reason if not runnable.

| # | Check | Expected |
| --- | --- | --- |
| A1 | `GET /api/v1/health` | 200 (DB + Redis up) |
| A2 | `GET /api/v1/public/hunian-catalog` | 200; items with allowlisted fields; `galleryPreview` present (array) |
| A3 | `GET /api/v1/public/hunian-catalog/:slug` (valid slug) | 200; `gallery` array present; unknown slug 404; malformed slug 400 |
| A4 | `GET /api/v1/public/rooms/summary` | 200 |
| A5 | `POST /api/v1/public/booking-leads` with invalid payload `{}` | 400 |
| A6 | Unauth `GET /api/v1/hunian-gallery` | 401 |
| A7 | Admin `GET /api/v1/hunian-gallery` *(if admin token available)* | 200 |
| A8 | Published gallery content `GET /api/v1/public/hunian-gallery/:id/content` *(if published sample exists)* | 200 inline bytes |
| A9 | Unpublished/deleted gallery content *(if sample exists)* | 404 (no probing feedback) |
| A10 | Leakage scan on A2/A3 responses | No `storage_path`, `fileId`, roomId, `room_code`, exact room number, PII, payment, or Smart Lock keys |

If lifecycle smoke creates temporary gallery images/files, delete/soft-delete them afterward (M19B pattern); no room inventory mutation.

## 5. Admin Smoke Checklist

| # | Check | Expected |
| --- | --- | --- |
| B1 | Admin login at `https://kelola.kostation.web.id` | Dashboard reached |
| B2 | Open `/hunian-gallery` (nav "Galeri Hunian") | Page loads with safety notices |
| B3 | Catalog selector loads | Public-safe items only (no room numbers/IDs) |
| B4 | Upload zone visible (drag-and-drop + click-to-select) | Rendered with type/size hints |
| B5 | Select image JPEG/PNG/WebP under 3 MB | Accepted by client validation |
| B6 | Local preview appears before upload | Preview rendered |
| B7 | Upload attaches to the selected catalog item | Card appears as Draft (`publicVisible=false`) |
| B8 | Set cover | "Cover" badge moves; single cover per item |
| B9 | Publish image | Badge Draft -> Publik |
| B10 | Edit caption/alt text | Saved and reflected on card |
| B11 | Reorder (Move Up/Down) | Order persists after reload |
| B12 | Delete with confirmation dialog | Card removed (soft-delete backend) |
| B13 | Permission denied / read-only state *(if `property_owner` account available)* | View-only UX; mutations rejected (403 backend) |
| B14 | No `storage_path` or internal file paths visible anywhere; `fileId` never shown to public surfaces | Confirmed in UI + network tab |

## 6. Public Smoke Checklist

| # | Check | Expected |
| --- | --- | --- |
| C1 | Open `https://app.kostation.web.id/kamar` without login | No auth redirect; page renders |
| C2 | Catalog cards load | Items with title/badges/price/availability |
| C3 | Published cover image appears *(if available)* | Proper 16:10 crop; badges legible |
| C4 | Fallback placeholder appears for items with no published image | "Galeri hunian sedang disiapkan..." (correct behavior, not a bug) |
| C5 | Filters (gender/category) work with shareable URLs | List updates; URL params preserved |
| C6 | "Lihat Detail" opens `/kamar/$slug` | Detail page loads |
| C7 | Hero gallery appears *(if images available)* | Cover-first, aspect-locked, counter/caption |
| C8 | Thumbnails work | Click switches hero; active state indicated |
| C9 | Lightbox opens/closes | Hero click opens; prev/next; Escape/close button works |
| C10 | "Ajukan Minat Booking" opens the lead form | Anonymous submit; success copy confirms NOT a confirmed booking |
| C11 | WhatsApp CTA works or shows the safe disabled fallback | Prefilled `wa.me` OR "Nomor WhatsApp admin belum dikonfigurasi." |
| C12 | No exact room number shown anywhere public | Confirmed |
| C13 | No roomId/`room_code` in UI or network responses | Confirmed |
| C14 | No payment/checkout UI on public pages | Confirmed |

## 7. Optional Local Browser Visual QA

The **VPS has no browser tooling**, so browser visual QA cannot run there. If visual confidence is needed (recommended before the next demo), run this locally against the staging URLs and store screenshots as evidence (suggested: `artifacts/m20-visual-qa/`).

| # | Check |
| --- | --- |
| V1 | Desktop `/kamar` (grid, cover images, badges, filters) |
| V2 | Mobile (~390px) `/kamar` (card stacking, tap targets) |
| V3 | Desktop `/kamar/$slug` (hero 16:9, thumbnails, price card) |
| V4 | Mobile `/kamar/$slug` (hero 4:3, thumbnail touch scroll, sticky CTA bar) |
| V5 | Admin `/hunian-gallery` (dropzone, cards, badges) |
| V6 | Upload flow end-to-end (select -> preview -> upload -> attach -> publish) |
| V7 | Public gallery/lightbox (open, prev/next, keyboard arrows, Escape, close button) |
| V8 | Console/network: no fatal console errors; no unexpected 4xx/5xx on happy path |
| V9 | Responsive layout: no overflow/clipping at common breakpoints |
| V10 | Image aspect ratio: no stretching/distortion; `object-cover`/`object-contain` correct |
| V11 | Broken image fallback: block one image request -> placeholder shown, no broken icon, no layout jump |
| V12 | Accessibility quick check: visible focus rings, thumbnail `aria-current`, lightbox focus trap + Escape, meaningful alt text |

If this section is skipped, the M20 verdict must carry the browser visual limitation (Section 11).

## 8. Safety / Privacy Checklist

| Rule | Check |
| --- | --- |
| No exact room number on any public surface | UI + API responses |
| No roomId/`room_code` exposure | UI + API responses |
| No `storage_path`/file-system path exposure | UI + API responses + network tab |
| No internal `fileId` in public responses | Public API allowlist only |
| No resident/tenant/occupancy PII | Public + admin gallery surfaces |
| No invoice/payment/bank exposure | Public surfaces |
| No Smart Lock/PALOMA exposure | Public surfaces |
| No public upload path of any kind | Confirmed |
| No payment booking / checkout | Confirmed |
| **No production-ready claim** in any recorded result or demo wording | Confirmed |
| Demo/test photos follow the manual SOP: no room-number plates, resident faces, documents, or internal info | Confirmed before upload |

## 9. Known Limitations

- Browser visual QA may remain deferred if not run locally; in that case M20 closes with the browser visual limitation recorded.
- `thumbnailUrl` is `null` backend-side: public thumbnails may load the original image (up to 3 MB) until a thumbnail pipeline exists (deferred, candidate next track).
- No video gallery. No cropping editor. No CDN/S3 offsite storage (content remains backend-mediated on local disk).
- Image review SOP is still manual (no automated face/plate/document detection).
- **Production readiness is still not claimed**: M14A/M14F production blockers, storage policy, and image review SOP remain open regardless of the M20 outcome.

## 10. Final M20 Acceptance Criteria

- [ ] Latest `master` deployed and API service freshly restarted (D1-D5 evidence recorded).
- [ ] API health and catalog routes smoke PASS (A1-A5, A10).
- [ ] Gallery API smoke PASS for runnable items (A6-A9; conditional items recorded as run or SKIPPED with reason).
- [ ] Admin gallery smoke PASS **if admin access available** (B1-B14; otherwise recorded as SKIPPED with reason).
- [ ] Public gallery smoke PASS (C1-C14).
- [ ] No safety/privacy exposure found (Section 8 all clear).
- [ ] Limitations documented in the results record (Section 9 restated with actuals).
- [ ] M20 verdict documented using the Section 11 wording, plus evidence references (commit SHA, restart time, screenshots if any).

Results should be recorded in a companion evidence document (suggested: `docs/20-staging-visual-qa/M20_STAGING_RESTART_VISUAL_QA_RESULT.md`) by the executing operator/agent - not by this planning pass.

## 11. Recommended Final Verdict Wording

- If all non-browser checks pass and local browser visual QA was NOT run:
  - **"M20 PASS with browser visual limitation."**
- If local browser visual QA is also run and passes:
  - **"M20 PASS with browser visual QA completed."**
- If any deployment/API/smoke check fails: record **M20 FAIL/PARTIAL** with the failing items, fix, and re-run - do not soften the wording.
- In all cases, append: production remains NOT READY; public booking remains NOT production-ready; payment booking deferred; Smart Lock live command NO-GO.
