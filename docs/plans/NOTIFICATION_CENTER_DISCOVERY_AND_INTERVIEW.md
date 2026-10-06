# Shared Header Notification Center: Discovery and Interview

Status: IMPLEMENTATION AUTHORIZED. Recommendations Q1–Q36 and the final recap were approved by the user; implementation was explicitly authorized on 2026-10-06.
Interview date: 2026-10-05. Implementation start: 2026-10-06.

## User scope

Introduce a notification panel opened by the header bell for Admin, Penghuni,
and Property Owner. Reuse the supplied visual reference and synchronize each
panel with the corresponding full notifications page. Clarify categories,
notification content, and actions through interview before implementation.

The preserved visual reference is
[NOTIFICATION_CENTER_COMPONENT_REFERENCE.md](NOTIFICATION_CENTER_COMPONENT_REFERENCE.md).
Technical documentation is English; product labels and messages are Indonesian.

## Existing facts

Codebase-memory has no indexed KOSTATION project in this session. Findings below
use targeted source inspection rather than exhaustive graph evidence.

- Admin's shared AppShell bell has no action and displays an unconditional dot.
  Source: `apps/admin/src/components/layout/app-shell.tsx`, line 124.
- Admin `/notifications` supports search, type/status/priority filters, pagination,
  individual read/archive, and mark-all-read. Source:
  `apps/admin/src/routes/notifications.tsx`.
- Admin center scopes rows and mutations to a property, without filtering by
  recipient. The recipient inbox uses the same notifications table, so these
  mutations can affect another recipient's read/archive state. Source:
  `backend/api/src/modules/notification/repositories/admin-notification-center.repository.ts`,
  lines 42, 105, 121, 133; `notification.repository.ts`, lines 80, 94.
- Admin's current type allowlist normalizes newer settlement events to `other`;
  the repository's exact `other` filter can then omit those normalized items.
  Source: `admin-notification-center.service.ts`, line 213;
  `admin-notification-center.repository.ts`, line 45.
- Penghuni's header dot is unconditional. A server unread-count hook already
  exists. The notifications page loads at most 50 items and has persistent
  read/archive actions; opening a related destination marks an item read.
  Sources: `apps/penghuni/src/components/AppHeader.tsx`, line 68;
  `apps/penghuni/src/hooks/usePenghuniNotifications.ts`, line 62;
  `apps/penghuni/src/routes/_app/notifications.tsx`, line 34.
- Owner's bell links to its notifications page and has a conditional unread dot.
  Its page uses monthly report-preview notifications with local filters, but
  exposes no read/archive or destination action. Sources:
  `apps/admin/src/components/property-owner-portal/OwnerPortalShell.tsx`, line 179;
  `PropertyOwnerPortal.tsx`, lines 3248, 3957.
- Owner report notifications apply recipient and ownership scope. Generic
  `/my/notifications` supports Owner read/archive but does not reproduce that
  asset-scope check. Reusing it unchanged would require reconciliation.
  Sources: `backend/api/src/modules/property-owner-management/property-owner-portal.service.ts`,
  lines 210, 1830; `modules/notification/controllers/my-notification.controller.ts`, line 13.
- Current targets largely link to category pages rather than the exact related
  record. Count, archived/expired filtering, and refresh behavior differ by role.

## Existing domain authority

`BILLING_REMINDER_NOTIFICATION_REPORTING.md`, sections 9.1 and 10, defines:

- in-app notification lifecycle: unread, read, archived;
- notification actions do not mutate the related business record;
- unread counts derive from authorized, active notifications;
- Owner visibility follows asset ownership; Penghuni visibility follows self context;
- safe title, summary, type, priority, timestamp, and authorized destination;
- an in-app notification does not imply a WhatsApp/email message was sent.

## Interview sequence

1. Shared decisions: account scope, header-panel layout, item anatomy, read and
   archive meaning. Q1-Q4 were approved by the user; see the decision record below.
2. Admin content: event categories, criteria, priority, grouping, and destinations.
3. Property Owner content: realization progress/publication/transfer distinctions,
   owned-asset events, safe finance details, current versus historical visibility.
4. Penghuni content: payments, lease/check-in/checkout, requests, and announcements.
5. Cross-surface synchronization, update frequency, duplicate prevention, bulk
   action scope, retention, empty/error states, and concrete acceptance scenarios.
6. Record approved decisions and implementation stages, then request confirmation
   that the interview is complete before implementing application code.

## Current implementation boundaries

Do not treat demo examples as actual Kostation notification sources. Do not
create duplicate event generation in the header component. Shared presentation
does not remove role, recipient, property, or ownership authorization.

Opening or archiving a notification must preserve the underlying workflow's
truth, including outstanding rent, pending verification, maintenance, and Owner
transfer/publication state. New event coverage requires explicit planning; a
read-only presentation change cannot create events that do not yet exist.

## Approved interview decisions: Q1-Q4

The user accepted all recommendations in the first interview round.

- **Q1: Independent account state.** Read/archive state belongs to each account.
  Admin A reading an item must not mark it read for Admin B, Penghuni, or Property
  Owner. Admin visibility remains limited to authorized properties; independent
  account state does not grant access to another account's inbox.
- **Q2: Header panel.** Desktop uses a panel approximately 400 px wide. Mobile
  uses a scrollable bottom sheet sized to the viewport. Show at most ten latest
  notifications for the selected view, with `Belum dibaca` and `Semua` choices and
  `Lihat semua notifikasi` linking to the corresponding role's page. The bell
  count represents all authorized active unread items, not the ten rendered rows.
  The initial selected view is still to be specified.
- **Q3: Item anatomy.** Each item has a category, event title, concise context,
  timestamp, unread indicator, and a role-authorized detail destination when
  available. Names, rooms, and amounts must be relevant and permitted. Color
  communicates attention level; category communicates the event's subject.
- **Q4: Read/archive behavior.** Opening the bell does not mark all items read.
  Expanding an item's full body or opening its detail marks that item read.
  The close action archives the item, retaining it in the notifications page.
  Replace the reference's `Clear` with `Arsipkan yang sudah dibaca`. These actions
  never complete the related payment, inspection, or realization workflow.

## Approved interview decisions: Q5-Q8 (Admin)

The user accepted all recommendations in the second interview round (Q5-Q8).

- **Q5: Admin categories.** Booking & Leasing (new leads, hold expiry,
  pending activation, lease end); Payments (proof review, due payments,
  verification, reversal); Rooms & Maintenance (inspection, work orders,
  ready room); Checkout & Refunds (requests, handover, settlement, transfer);
  Owner Realization (eligible contracts, pending stages, transfer, publication);
  Service Requests (complaints, SLA, vehicle/parking); Accounts & System
  (provisioning/reset and actionable failures). Each item must state the event
  and next action. Categories without producers need separately planned events.
- **Q6: Admin full page.** Provide `Belum dibaca`, `Semua`, and `Arsip` views,
  defaulting to `Belum dibaca` on both header panel and full page. Filter by
  category, attention level, date, and relevant name/room/document code. Full
  body expansion and authorized `Buka rincian` destination are supported.
- **Q7: Attention levels.** `Mendesak` (overdue/failure/immediate response),
  `Perlu perhatian` (review/approval/pending work), `Informasi` (success or
  awareness). Red, amber, and blue/green respectively. Unread state is
  independent of attention: a read item may still require action.
- **Q8: Event deduplication.** A refresh or page visit never emits a duplicate.
  New entries correspond to new events, significant state changes, or an agreed
  due-date milestone. A payment proof gets one pending-review event; later
  verification is a distinct event. Existing reminder schedules, rather than
  every refresh, govern deadline repetition.

Implementation planning must distinguish existing event producers from new ones;
adding a category label alone does not produce a notification for that category.

## Approved interview decisions: Q9-Q12 (Property Owner scope)

The user accepted all recommendations in the third interview round.

- **Q9: Owner categories.** Realization, fund transfer, assets and occupancy,
  complaints and maintenance, management fees borne by the Owner, and account
  or Property Manager announcements. Include only events relevant to that
  Owner's authorized assets or obligations.
- **Q10: Period scope.** The header bell shows recent authorized notifications
  across all periods. Period and asset filters live on the full notifications
  page, so an older-period event remains visible when newly published.
- **Q11: Panel disclosure.** The compact panel may show the event, period,
  asset or room code, status, and Owner entitlement amount when relevant. It
  must not expose payment evidence or resident personal data there. A detail
  destination performs its own authorization check.
- **Q12: Ended ownership.** No new asset notifications are delivered after the
  Owner's entitlement to that asset ends. History from the valid ownership
  period may remain visible, but its detail destination is enabled only when
  historical access remains authorized. A stale notification link must not
  bypass current access control.

## Approved interview decisions: Q13-Q16 (Property Owner realization)

The user accepted all recommendations in the fourth interview round.

- **Q13: Publication boundary.** An Owner notification is emitted when an
  Owner realization is published and visible to that Owner. Newly eligible
  contracts and drafts remain Admin-facing internal progress, not final Owner
  entitlement announcements.
- **Q14: Transfer boundary.** An Owner transfer notification requires a
  recorded and verified transfer. A planned or merely initiated transfer is
  insufficient. Copy says the transfer was recorded or verified; it must not
  claim the money reached the bank account without evidence of receipt.
- **Q15: Distinct events.** Realization publication and verified transfer are
  separate notification events, even if close in time, because the first
  concerns entitlement and documents and the second concerns disbursement.
- **Q16: Correction or cancellation.** If an announced realization or transfer
  is later corrected or cancelled, create a new notification explaining the
  change and concise reason, and mark the old notification as superseded.
  Do not silently rewrite the original announced figures.

## Approved interview decisions: Q17-Q20 (Property Owner grouping)

The user accepted all recommendations in the fifth interview round.

- **Q17: Realization grouping.** Emit one notification per published
  realization document/batch for one Owner and period, summarizing room count
  and total Owner entitlement. Do not emit one notification per room. A
  subsequent publication is a distinct event with its own document reference.
- **Q18: Staged transfer.** Emit one notification per verified transfer with
  amount, date, and reference code. Later installments are distinct events;
  retrying persistence for the same transfer must be idempotent.
- **Q19: Pending transfer reminders.** Do not send repetitive automatic Owner
  reminders while funds have not yet transferred. The Owner finance detail
  keeps the status visible; actionable lateness goes to Admin instead.
- **Q20: Exact destinations.** Link to the particular realization or transfer
  detail with a fresh authorization check. If detail access has ended, show
  a clear explanation and offer an authorized report-page route instead of
  a raw error page.

## Approved interview decisions: Q21-Q24 (Other Property Owner events)

The user accepted all recommendations in the sixth interview round.

- **Q21: Material occupancy and room changes.** Notify after an actual
  check-in, recorded checkout handover, or room status transition to needs
  inspection, maintenance, or ready for use. Draft internal leasing plans do
  not generate Owner notifications.
- **Q22: Asset-related service only.** Notify about maintenance that affects
  the Owner's asset, including work start, an Owner cost or decision request,
  and completion. Do not disclose unrelated resident complaints or unnecessary
  private details in the Owner summary.
- **Q23: Owner-borne management fees.** Notify when an Owner-payable fee invoice
  is issued, when an agreed due-date milestone occurs, and when payment is
  verified. A fee that is merely part of internal entitlement calculation is
  not a separate Owner invoice event.
- **Q24: Account and announcements.** Notify after successful account email
  or password changes, actionable account security issues, and important
  Property Manager announcements. Never include a password, secret link, or
  authentication data in notification content.

## Approved interview decisions: Q25-Q28 (Penghuni lifecycle)

The user accepted all recommendations in the seventh interview round.

- **Q25: Penghuni categories.** Booking & Room, Bills & Payments, Lease &
  Check-in, Checkout & Refund, Complaints & Maintenance, and Account. The
  initially proposed Announcements category was removed by the later Q32
  decision. Deliver only events belonging to the authenticated resident.
- **Q26: Payment evidence versus verification.** Evidence received for review,
  payment verified, and evidence requiring correction are distinct events.
  Uploading evidence alone must never be described as bill settlement.
- **Q27: Pre-check-in period.** Before check-in, show the lease duration and
  pending activation/check-in status without a not-yet-effective lease date
  range. After recorded check-in, notify with the authoritative lease start
  and end dates.
- **Q28: Checkout milestones.** Room handover, financial settlement, and
  verified refund are separate notices. Do not say the entire checkout is
  finished when only one milestone is complete.

## Approved interview decisions: Q29-Q32 (Penghuni operations)

The user accepted Q29-Q31 and approved Q32 with an explicit exception:
the Penghuni announcement feature and UI are out of scope for now.

- **Q29: Booking events.** Notify on successful room hold, its agreed
  deadline reminder, booking confirmation, and hold expiry or release. A page
  visit does not create an event.
- **Q30: Billing reminders.** Reuse the established reminder schedule and
  distinguish invoice due dates from contract-payment checkpoints. Stop
  irrelevant reminders after verification, cancellation, or a correction that
  changes the obligation.
- **Q31: Resident service events.** Notify on the resident's own complaint
  received/in progress/response needed/completed milestones and room work
  directly affecting them. Exclude internal staff notes and other residents'
  complaints.
- **Q32: Account, with announcement exception.** Notify on material account
  or security changes without secrets, and use authorized record destinations.
  Do not ship resident announcements or their notification category now.
  Existing resident announcement UI is a placeholder, not an operational
  resident-facing endpoint: `apps/penghuni/src/routes/_app/index.tsx` shows
  `Pengumuman Terbaru`; `apps/penghuni/src/routes/_app/info.tsx` has a
  `Pengumuman` tab; `usePenghuniInfo.ts` always returns unavailable/empty.
  Implementation should remove these announcement affordances while leaving
  unrelated `Peraturan` and `FAQ` features intact. Do not delete historical
  announcement data or Admin-side facilities merely to hide the resident UI.

## Approved interview decisions: Q33-Q36 (Cross-surface delivery)

The user accepted all recommendations in the eighth interview round.

- **Q33: Shared server state.** Header panel and full notification page use the
  same server-backed inbox and per-account read/archive state. Refresh on panel
  open, app reactivation, and after a user action; do not keep a browser-only
  competing state copy.
- **Q34: Mark all read.** The action applies to all active unread notifications
  authorized for that account, not only the ten rows currently rendered.
  Archiving read items only changes notification visibility; it does not
  complete or alter a business obligation.
- **Q35: Retention.** No automatic permanent deletion is planned until a
  retention policy is defined. Archived items remain searchable in the full
  page, with pagination; no permanent-delete action is exposed to users.
- **Q36: Phased event coverage.** Enable a category only when real event
  producers, authorization, and detail destinations are ready. Do not use
  dummy events or imply that a category works merely because its filter is
  present. Implement and verify coverage incrementally by role/event source.

## Interview status

Recommendations Q1–Q36 and the concise end-to-end recap have been approved.
The user explicitly authorized implementation on 2026-10-06 with the existing
component reference and named design skills. Source coverage is phased: only
real committed producers with verified role scope and destinations are enabled.
See NOTIFICATION_CENTER_IMPLEMENTATION.md for implementation and verification evidence.
