# M12A Mockup Feature Gap Audit

Date: 2026-07-02

Scope:
- Current project: `D:\PROJECT CODING\Granada Kost Platform`
- Lovable Admin mockup: `D:\PROJECT CODING\KOST tutorial\SC Template Lovable KOST\Console Admin KOST`
- Lovable Penghuni mockup: `D:\PROJECT CODING\KOST tutorial\SC Template Lovable KOST\App Mobile Penghuni KOST`

Rules observed:
- Documentation only.
- No source code changes.
- No browser launch.
- No smoke test.
- No Lovable MCP connection.
- Local file inspection only.
- Current backend/API/ADR are treated as production source of truth.
- Lovable export is treated as UI/reference source only.

## 1. Executive summary

The current Granada/Kostation project is already more production-shaped than the original Lovable mockup in several core areas. Current Admin adds authentication, RBAC-aware navigation, Vehicles, Parking, feature flags, and live integration direction that did not exist in the Lovable Admin export. Current Penghuni adds authentication and live account-oriented surfaces while preserving several Lovable-inspired UX routes.

The Lovable export still contains useful UI reference for future product breadth: Smart Lock, CCTV, Booking, Chat, payment-style interactions, complaint photo upload, and visible hardware/booking pages. However, those mockup features are largely dummy-data or local-state flows. They should not be interpreted as production-ready unless the current backend/API/ADR supports them.

The largest current gaps are not simple route absence. They are integration gaps:
- Smart Lock UI exists in Admin but is still mock/simulated from the frontend perspective.
- CCTV UI exists but is hidden by feature flag and mock-driven.
- Booking UI exists but is hidden by feature flag and mock-driven.
- Penghuni payment proof upload is intentionally disabled pending a stable File API/frontend upload flow.
- Complaint create/upload is intentionally gated because the resident-facing category/file contract is not complete enough for a truthful workflow.
- Chat is route-accessible in Penghuni but dummy/local-state.
- Export and Audit Viewer are intentionally placeholder/disabled until backend endpoints exist.

Recommended product order:
1. Before Smart Lock site visit: finish non-hardware readiness gaps that improve demo honesty and operational usefulness, especially file upload flows, complaint create readiness, feature flag consistency, and simulated Smart Lock integration against the current backend where feasible.
2. After Smart Lock/CCTV access: complete live Smart Lock and CCTV integration using real device/gateway behavior.
3. Keep payment gateway, public booking, full chat, push/WhatsApp, and advanced CCTV/Smart Lock automation deferred to later milestones.

## 2. Feature comparison table

| Feature | Lovable Admin mockup | Lovable Penghuni mockup | Current Admin | Current Penghuni | Production feasibility / decision |
| --- | --- | --- | --- | --- | --- |
| Authentication | No login route in export | No login route in export | Login route present | Login route present | Current project is more production-ready than mockup. |
| Dashboard/Home | Present with mock data | Present with dummy data | Present | Present | Core current surface retained. |
| Rooms/Kamar | Present | Not applicable | Present | Room/account context via home/profile | Current Admin retains core operational surface. |
| Tenants/Penghuni | Present | Not applicable | Present | Current user profile/session | Current Admin retains core operational surface. |
| Payments/Billing | Present | Billing and payment interaction UI present | Present | Billing present | Current project uses production-oriented billing hooks, but upload/payment gateway remain incomplete. |
| Payment gateway | Mock-style payment options in Penghuni UI | Mock-style pay action | No real gateway UI | No real gateway UI | Defer. Backend architecture treats payment gateway/callbacks as later-phase, security-sensitive work. |
| Payment proof upload | UI reference exists in Penghuni billing | Upload/payment action reference exists | Admin payment/proof read surfaces are partial | Upload proof button intentionally disabled | Gap before resident billing is complete; needs File API/frontend upload contract. |
| Complaints | Present | Present, including photo upload reference | Present | Complaint list/read present | Current read/workflow is more production-shaped; create/upload still gated. |
| Complaint file upload | Upload photo reference in mockup | Upload photo reference in mockup | Not complete as production UI | Not complete; create flow disabled/gated | Gap. Needs resident-safe category/create/file flow. |
| Vehicles | Not present | Not present | Present | Not present | Current project exceeds Lovable mockup. |
| Parking | Not present | Not present | Present | Not present | Current project exceeds Lovable mockup. |
| CCTV | Visible menu/page | Not present | Route exists, nav hidden by feature flag by default | Not present | Defer live CCTV until gateway/site readiness. Keep hidden until truthful. |
| Smart Lock | Visible menu/page | Not present | Route visible, frontend still mock/simulated | Not present | Backend exists, but frontend should remain simulated until live provider/site access is ready. |
| Access History | Present | Not present | Present | Not present | Current Admin retains mockup route; should become real Smart Lock/access audit when hardware integration lands. |
| Booking public/request | Present | Not present | Route exists, hidden by booking flag by default | Not present | Defer. Public/booking fee flow belongs later phase. |
| Booking management | Present | Not present | Route exists, hidden by booking flag by default | Not present | Defer until booking backend/product scope is ready. |
| Chat | Not an Admin route | Present | No Admin chat inbox | Route exists with dummy/local-state behavior | Missing production feature; defer full chat. |
| Reports | Present | Not applicable | Present | Not applicable | Current reports aggregate live surfaces; export is disabled. |
| Export | UI reference expected in report context | Not applicable | Export button disabled | Not applicable | Placeholder until backend export endpoint/job exists. |
| Audit Viewer | Not a clear production backend feature in mockup | Not applicable | Placeholder only | Not applicable | Placeholder until audit endpoint exists. |
| Notifications | Present | Present | Present | Present | Feature surface exists; push/live delivery should stay behind production contract. |
| Settings/Profile | Present | Profile/settings present | Present | Profile present | Current profile edit/change password remain disabled where backend contract is absent. |
| Feature flags | Not present | Not present | Present for CCTV, Booking, Chat, Push, Smart Lock mode | Present for Chat, Push, Smart Lock mode | Current project is safer for staged delivery. Chat flag should be applied consistently. |
| RBAC/menu guards | Not present | Not present | Present in navigation | Authenticated app shell present | Current project is more production-ready. |

## 3. Admin feature gaps

### Smart Lock

Lovable provides a visible Smart Lock dashboard reference. Current Admin also has a Smart Lock route and keeps it visible for owner/manager roles, but the page still behaves as a simulated/mock frontend surface. The backend contains Smart Lock modules and controller structure, so the gap is specifically the Admin frontend integration and real-device readiness, not the concept itself.

Admin Smart Lock should remain clearly simulated until the site visit confirms physical device access, provider credentials, pairing behavior, and operational constraints.

### CCTV

Lovable provides a visible CCTV page. Current Admin has a CCTV route, but navigation hides it by default through `VITE_FEATURE_CCTV_ENABLED=false`. The route is mock/preview-oriented and should remain hidden until the CCTV gateway or local stream model is production-feasible.

### Booking

Lovable provides Booking and Booking Management pages as visible Admin routes. Current Admin keeps both routes but hides them by default through `VITE_FEATURE_BOOKING_ENABLED=false`. The current backend architecture treats public booking and booking payment flows as later-phase candidates, so these pages should not be promoted before backend scope exists.

### Payment proof operations

Current Admin has payment and proof-related read surfaces, but the end-to-end payment proof lifecycle is incomplete from a production UX perspective. The resident upload flow is disabled, and Admin proof verification/rejection needs a stable backend/controller and file viewing contract before it becomes a reliable operational workflow.

### Complaint operations

Admin complaints are present, but supporting operations such as technician assignment and file attachment workflows remain incomplete or disabled. Lovable can be used as UI reference for richer complaint context, but the current production gap is the backend-safe assignment/file workflow.

### Export

Lovable implies broad reporting affordances. Current Admin Reports intentionally disables export because the backend export endpoint/job is not available. This is a correct placeholder, not a frontend bug.

### Audit Viewer

Current Admin exposes an Audit Viewer placeholder with unavailable state. This should remain placeholder until the backend exposes a production audit endpoint and access policy.

### Chat

Lovable only provides Chat in the Penghuni app. Current Admin has no chat inbox counterpart. If Chat becomes a product requirement, Admin will need a support/inbox surface, not only the existing Penghuni dummy chat route.

## 4. Penghuni feature gaps

### Payment proof upload

Lovable Penghuni billing contains payment/upload-style UI reference. Current Penghuni billing reads invoices/payments but intentionally disables "Upload bukti pembayaran" until a stable File API/upload flow exists. This is the highest-impact resident gap before billing can be considered complete.

### Complaint create and file upload

Lovable Penghuni complaints includes complaint creation and photo upload reference. Current Penghuni complaints list/read is production-shaped, but the create action is gated because the required category/create/file contract is not safe for resident use yet. The gap is not only the file picker; it includes resident-readable categories, create complaint payload, upload attachment, and post-submit feedback.

### Chat

Lovable Penghuni Chat exists as a dummy-data experience. Current Penghuni Chat also exists but remains local/dummy-state with simulated admin replies. The route is therefore present, but the production feature is missing.

### Smart Lock resident experience

Lovable Penghuni does not include a Smart Lock route, and current Penghuni also does not expose a resident Smart Lock card/control. If the site visit validates Smart Lock access, Penghuni will likely need a resident-facing lock/access status surface after Admin integration is stable.

### Profile management

Current Penghuni Profile shows real session/account context, but edit profile, change password, notification preferences, and privacy policy actions are disabled where backend contracts are absent. Lovable can provide layout reference, but these should be implemented only when API support is available.

### Info content

Penghuni Info exists, but content should be reviewed as operational product content. It should not remain a purely decorative placeholder before broader resident rollout.

## 5. Hidden or disabled features

| Feature | Current state | Reason / decision |
| --- | --- | --- |
| Admin CCTV nav | Hidden by default | `VITE_FEATURE_CCTV_ENABLED=false`; defer until gateway/site readiness. |
| Admin Booking nav | Hidden by default | `VITE_FEATURE_BOOKING_ENABLED=false`; defer until booking backend/product scope exists. |
| Admin Booking Management nav | Hidden by default | Same booking flag and backend readiness constraint. |
| Admin Reports export | Disabled | Waiting for backend report export endpoint/job. |
| Admin Audit Viewer | Placeholder/unavailable | Waiting for backend audit endpoint. |
| Admin assign technician | Disabled/incomplete | Needs production assignment contract and picker. |
| Penghuni payment proof upload | Disabled | Waiting for File API/upload integration. |
| Penghuni complaint create | Visible but gated/disabled | Resident-safe category/create contract is incomplete. |
| Penghuni profile edit | Disabled | No stable update profile API contract in current frontend. |
| Penghuni change password | Disabled | No stable change-password flow in current frontend. |
| Penghuni notification preferences | Disabled | Push/preferences contract is not production-ready. |
| Penghuni Chat feature flag | Flag exists but route remains accessible | Needs consistent gating before release. |

## 6. Placeholder features

| Placeholder | Current location / behavior | Recommended handling |
| --- | --- | --- |
| Smart Lock dashboard | Admin route exists with simulated/mock frontend behavior | Keep visible only with clear simulated mode until live provider/site access is validated. |
| CCTV dashboard | Admin route exists but hidden by flag | Keep hidden until gateway/stream contract is ready. |
| Booking pages | Admin routes exist but hidden by flag | Keep hidden until backend product scope exists. |
| Reports export | Disabled button in Reports | Keep disabled until backend export exists. |
| Audit Viewer | Explicit unavailable placeholder | Keep placeholder until backend audit endpoint exists. |
| Penghuni Chat | Dummy/local-state chat with simulated replies | Hide or clearly mark as placeholder until real chat backend exists. |
| Penghuni Info | Informational content surface | Replace placeholder content with approved operational content before resident release. |
| Payment proof upload | Disabled resident action | Implement only after File API/upload contract is stable. |
| Complaint file upload | Lovable reference only / not production-ready | Implement with resident complaint create and attachment API contract. |

## 7. Missing features

The following are present in Lovable as UI ideas or implied by the requested comparison focus, but are missing or incomplete in the current production-ready project:

- Real Admin Smart Lock integration against backend/device data.
- Real CCTV stream/gateway integration.
- Resident Smart Lock status/control surface.
- Production payment gateway flow.
- Resident payment proof upload with file attachment.
- Admin payment proof file viewer and review workflow, subject to backend controller support.
- Resident complaint creation with safe category lookup.
- Complaint file upload from Penghuni.
- Full Chat backend and Admin support inbox.
- Booking backend integration and public/resident booking flow.
- Reports export endpoint integration.
- Audit Viewer endpoint integration.
- Push notification preferences and delivery integration.

The following are not missing relative to Lovable because the current project already exceeds the mockup:

- Admin login/authentication.
- Penghuni login/authentication.
- RBAC-aware Admin navigation.
- Vehicles.
- Parking.
- Production-oriented feature flags.

## 8. Features that should remain deferred

These features should remain deferred because the current backend/API/ADR position makes them later-phase or hardware-dependent:

| Feature | Deferral reason |
| --- | --- |
| Payment gateway | Requires secure provider integration, idempotent callbacks, auditability, and reconciliation rules. |
| Public booking | Requires public data boundary, booking lifecycle rules, and payment/fee decisions. |
| Booking fee payment | Depends on booking/payment gateway scope. |
| Full Chat | Requires thread/message backend, Admin inbox, retention/privacy rules, and notification behavior. |
| Push/WhatsApp delivery | Requires provider, consent/preference handling, and operational policy. |
| Live CCTV | Requires gateway/stream architecture, access controls, local network constraints, and site validation. |
| Advanced CCTV motion/snapshot analytics | Depends on live CCTV gateway foundation. |
| Real Smart Lock provider mode | Requires physical device access, credentials, pairing, failure handling, and site visit validation. |
| Advanced Smart Lock automation | Should wait until manual/simulated and live lock flows are proven. |

## 9. Features recommended before Smart Lock site visit

These items are not blocked by physical lock/CCTV hardware and will make the site visit more productive:

1. Harden feature flag behavior so hidden/disabled surfaces are consistent across menu, direct routes, and release notes.
2. Keep Penghuni Chat hidden or explicitly placeholder-labeled until the feature has a real backend and Admin inbox.
3. Complete payment proof upload readiness around File API, file validation, upload progress, and Admin review path.
4. Complete resident complaint create readiness, including resident-safe category lookup and optional attachment flow.
5. Replace or connect Admin Smart Lock mock data with the current backend simulated/runtime contract where feasible, while keeping the UI clearly marked as simulated.
6. Prepare Smart Lock device inventory fields needed for the visit: device identity, room binding, credential owner, provider mode, and failure state.
7. Prepare CCTV inventory fields needed for the visit: camera identity, location, stream/gateway type, access policy, and health state.
8. Confirm audit requirements for hardware actions so unlock/open/credential events can be traced before live testing.

## 10. Features recommended after Smart Lock/CCTV

After physical Smart Lock and CCTV constraints are known, prioritize:

1. Live Smart Lock Admin integration for devices, credentials, restrictions, alerts, and access history.
2. Resident Smart Lock status/access surface if product policy allows resident-facing unlock or credential visibility.
3. CCTV gateway/preview integration with secure access boundaries.
4. CCTV camera health, snapshot, and access logging.
5. Hardware-aware audit viewer for Smart Lock/CCTV operational events.
6. Reports export for hardware/access/compliance reporting after event data is reliable.
7. Booking, Chat, payment gateway, push/WhatsApp, and advanced automation only after the hardware foundation is stable.

## 11. Suggested milestone placement

| Milestone | Suggested scope | Notes |
| --- | --- | --- |
| M12A | Mockup feature gap audit | This document. Documentation only. |
| M12B | Feature flag and placeholder hardening | Ensure hidden/disabled UI is consistent and release-safe. |
| M12C | File API frontend integration | Payment proof upload, complaint attachment foundation, validation, and file viewing. |
| M12D | Penghuni complaint creation | Resident-safe categories, create complaint, optional attachment, and clear success/error states. |
| M12E | Payment proof review completion | Admin proof viewer/review path after backend controller contract is confirmed. |
| M12F | Smart Lock simulated backend integration | Move Admin Smart Lock from mock frontend data to current backend simulated/runtime contract. |
| M12G | Smart Lock site visit readiness | Device inventory, credential mapping, provider mode validation, and audit checklist. |
| M12H | Live Smart Lock integration | Only after site visit confirms device/provider access. |
| M12I | CCTV site integration | Gateway/stream contract, secure preview, camera health, and access logging. |
| M12J | Audit Viewer and Reports Export | Implement when audit/export backend endpoints are available. |
| M13 | Deferred product expansion | Public booking, payment gateway, full chat, push/WhatsApp, advanced CCTV/Smart Lock automation. |

## Audit verdict

Lovable is useful as a UI/reference baseline, but the current project should not attempt a direct feature parity chase. The correct release posture is selective parity:

- Keep production-ready current additions such as auth, RBAC, Vehicles, and Parking.
- Promote only mockup features that have backend/API/ADR support.
- Keep hardware, booking, payment gateway, chat, export, and audit features staged behind explicit readiness milestones.
- Prioritize file upload, complaint create, and simulated Smart Lock backend integration before the Smart Lock/CCTV site visit.
