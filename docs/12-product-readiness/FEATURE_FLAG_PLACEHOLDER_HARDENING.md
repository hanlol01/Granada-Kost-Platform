# M12B Feature Flag and Placeholder Hardening

Date: 2026-07-02

Source:
- `docs/12-product-readiness/MOCKUP_FEATURE_GAP_AUDIT.md`

Scope:
- Admin frontend feature flags, hidden routes, placeholder pages, and disabled UI.
- Penghuni frontend feature flags, placeholder pages, disabled UI, and direct route access.

Out of scope:
- Real CCTV implementation.
- Real Smart Lock provider implementation.
- Payment gateway.
- File upload.
- Backend changes.
- ADR changes.
- Browser or smoke testing.

## Changes made

### Admin

- `apps/admin/src/routes/cctv.tsx`
  - Direct `/cctv` access now shows a clear disabled state when `VITE_FEATURE_CCTV_ENABLED=false`.
  - If the flag is enabled, the page shows a visible preview warning that the CCTV view is not connected to production gateway/stream data.

- `apps/admin/src/routes/booking.tsx`
  - Direct `/booking` access now shows a clear disabled state when `VITE_FEATURE_BOOKING_ENABLED=false`.
  - If the flag is enabled, the page shows a visible placeholder warning that booking/payment flow is not production-ready.

- `apps/admin/src/routes/bookings.tsx`
  - Direct `/bookings` access now shows a clear disabled state when `VITE_FEATURE_BOOKING_ENABLED=false`.
  - If the flag is enabled, the page shows a visible placeholder warning that booking approval/payment fee flow is not production-ready.

- `apps/admin/src/routes/smart-lock.tsx`
  - Smart Lock now shows visible simulated-mode labeling when `VITE_FEATURE_SMARTLOCK_MODE=simulated`.
  - Sync and lock/unlock feedback now explain that simulated mode does not call a live provider.

### Penghuni

- `apps/penghuni/src/routes/_app/chat.tsx`
  - Direct `/chat` access now shows a feature-disabled state when `VITE_FEATURE_CHAT_ENABLED=false`.
  - If chat is enabled, the route is clearly labeled as placeholder and message sending is disabled.

- `apps/penghuni/src/routes/_app/complaints.tsx`
  - Complaint support CTA now respects `VITE_FEATURE_CHAT_ENABLED`.
  - The disabled complaint-create sheet no longer points residents into Chat when chat is disabled.
  - Create complaint remains gated with a clear explanation.

- `apps/penghuni/src/routes/_app/profile.tsx`
  - Profile Chat link now respects `VITE_FEATURE_CHAT_ENABLED`.
  - Disabled edit profile affordance now has visible helper text, not only an aria label.

## Feature flag behavior

| Feature | Flag | Default | Menu/link behavior | Direct route behavior |
| --- | --- | --- | --- | --- |
| Admin CCTV | `VITE_FEATURE_CCTV_ENABLED` | `false` | Admin nav item hidden | `/cctv` shows disabled state |
| Admin Booking | `VITE_FEATURE_BOOKING_ENABLED` | `false` | Admin nav item hidden | `/booking` shows disabled state |
| Admin Booking Management | `VITE_FEATURE_BOOKING_ENABLED` | `false` | Admin nav item hidden | `/bookings` shows disabled state |
| Admin Smart Lock | `VITE_FEATURE_SMARTLOCK_MODE` | `simulated` | Nav remains visible for allowed roles | Page labels simulated mode |
| Penghuni Chat | `VITE_FEATURE_CHAT_ENABLED` | `false` | Profile/complaint links disabled or hidden as actions | `/chat` shows disabled state |

## Route and menu behavior

- Production-ready routes remain unchanged.
- Admin menu hiding for CCTV and Booking remains centralized in `apps/admin/src/components/layout/nav.tsx`.
- Admin direct access is now aligned with menu hiding for `/cctv`, `/booking`, and `/bookings`.
- Penghuni bottom navigation still does not expose Chat.
- Penghuni direct `/chat` access is now gated by the chat flag.
- Penghuni profile and complaint support entry points now match the chat flag.

## Placeholder and disabled UI behavior

- Placeholder pages now state that they are preview, simulated, or not production-ready.
- Disabled routes use explicit disabled/coming-soon language instead of rendering convincing mock workflows.
- Disabled buttons/actions have visible reason text:
  - Reports export: waits for `/reports/exports`.
  - Audit Viewer: waits for backend audit endpoint.
  - Payment proof upload: waits for File API.
  - Complaint create: waits for resident-safe category/create contract.
  - Profile edit: waits for Penghuni profile update endpoint.
  - Change password and notification preferences: remain visibly disabled with helper text.

## Remaining deferred features

- Real CCTV gateway/stream integration.
- Real Smart Lock provider integration.
- Payment gateway.
- File upload for payment proof and complaint attachments.
- Resident complaint creation with resident-safe category lookup.
- Full chat backend and Admin inbox.
- Booking backend, public booking, and booking fee payment.
- Reports export backend endpoint/job.
- Audit Viewer backend endpoint.
- Push/WhatsApp delivery and resident notification preferences.

## Validation result

Result:
- `npm run lint:admin` passed with existing warnings only.
- `npm run lint:penghuni` passed with existing warnings only.
- `npm --workspace @granada-kost/admin run typecheck` passed.
- `npm --workspace @granada-kost/penghuni run typecheck` passed.
- `npm run build:admin` passed.
- `npm run build:penghuni` passed.

Notes:
- No browser launched.
- No smoke test run.
- Build output includes existing Vite/Lovable informational warnings.

## Verdict

M12B hardening aligns menu visibility, direct route behavior, simulated labels, placeholder copy, and disabled-action explanations for the pre-site-visit release posture.
