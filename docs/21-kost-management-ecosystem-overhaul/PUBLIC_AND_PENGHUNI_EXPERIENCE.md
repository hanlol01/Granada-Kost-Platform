# Public Catalog and Penghuni Experience

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

Program: `KMO`

Surfaces:

- public catalog at `/kamar`; and
- authenticated Penghuni web application.

## 1. Purpose and Shared Boundaries

The public catalog helps a prospective resident understand KOSTATION and submit
an expression of interest. The Penghuni application helps an active resident
understand their own room, lease, billing, payments, complaints, vehicles, and
operational notices.

These surfaces share content and domain facts, but not access:

- public users never need to log in to browse `/kamar`;
- public users see category-level promotional facts, not an exact room;
- Penghuni users see only their canonical resident context;
- an expression of interest is not a booking, hold, lease, occupancy, invoice,
  or payment;
- the public form never provisions credentials; and
- the Penghuni app does not expose Admin commands.

Visual implementation must extend `DESIGN.md`. Screenshots supplied during
planning are behavior references only; they are not visual specifications.

The `FR-PUB-*-1xx` and `FR-PEN-*-1xx` requirements below refine the PRD's
canonical `0xx` outcomes; they do not replace or renumber those parent
requirements.

## 2. Public Route Topology

| Route                  | Purpose                                                           | Access |
| ---------------------- | ----------------------------------------------------------------- | ------ |
| `/kamar`               | Category catalog, availability context, and discovery filters     | Public |
| `/kamar/:categorySlug` | Category detail, gallery, facilities, terms summary, and lead CTA | Public |
| `/login`               | Penghuni sign-in                                                  | Public |

The public catalog does not expose a route for an exact room, room number,
building UUID, occupancy, resident, hold, or lease.

Legacy `/kamar/:slug` values that represented internal inventory must be
redirected to the safe category detail or return a public not-found state. They
must not reveal why an internal record was hidden.

### FR-PUB-PUBLIC-101 — Public access integrity

`/kamar` and its category detail must render without an authenticated session.
An expired or absent refresh token may not turn the public terminal state into a
login redirect or blocking error.

Acceptance:

- desktop and mobile reach loading, populated, or valid empty terminal states;
- public data requests are GET-only except the explicit lead submission;
- no protected `/rooms`, `/residents`, `/leases`, or billing response is used to
  build the page; and
- public navigation never exposes Admin/Penghuni route controls.

## 3. Public Catalog Listing

### FR-PUB-CONTENT-101 — Public hero and trust facts

The `/kamar` introduction uses the published property profile and contains:

- property name;
- concise positioning for student accommodation;
- location summary and map link;
- contact availability;
- published facility highlights;
- security/house-rule summary;
- category availability counts when authoritative; and
- clear copy that submitting interest does not reserve a room.

All content comes from published Admin authorities. Hardcoded placeholder phone,
zero counts, or invented facilities must not be displayed.

### FR-PUB-PUBLIC-102 — KOSTATION-native discovery controls

Because the catalog represents one managed property, it must not imitate a
nationwide accommodation marketplace with location search.

Discovery controls are:

- **Kategori**: Semua, Rumah Kost, Apart Kost;
- **Untuk**: Putra or Putri;
- **Rencana Mulai**: date or “Belum ditentukan”; and
- **Rencana Sewa**: minimum 12 months, with annual-full or two-month installment
  interest.

Gender can be left unset while browsing, but is required before lead
submission. Category can be unset on the listing, but a category is required
before submission. The displayed lease choices must follow `POL-LEASE-001` and
`POL-BILLING-002`; the public UI may not promise a shorter contract.

Filtering updates the URL, count summary, and category cards. It must not reveal
which exact rooms match.

### FR-PUB-ROOM-101 — Category-level inventory presentation

The catalog presents at most two category cards:

- Rumah Kost; and
- Apart Kost.

Each card shows:

- category name;
- gender availability represented in aggregate;
- starting/comparison monthly price and annual contract value from category
  authority;
- minimum lease term;
- facility highlights;
- cover image;
- aggregate vacant/available count when safe and current;
- publication state; and
- **Lihat Detail**.

Price is descriptive, not a per-room quote. `POL-BILLING-001` keeps commercial
authority at category level. No card renders room number, building code,
resident, occupancy, opaque ID, or hold detail.

### FR-PUB-PUBLIC-103 — Listing states

The public listing must distinguish:

- loading;
- no published categories;
- categories published but no current availability;
- filter with no matching category;
- content temporarily unavailable;
- stale content refresh; and
- invalid URL filter.

No-availability copy may still allow **Ajukan Minat** for follow-up, but must say
that availability will be confirmed by Admin.

## 4. Public Category Detail

### FR-PUB-CONTENT-102 — Category gallery

`/kamar/:categorySlug` renders the published gallery for the selected category:

- one cover image;
- ordered thumbnails;
- accessible alt text and captions;
- full-screen viewer with keyboard navigation;
- image count; and
- graceful fallback when no image is published.

The public gallery is the output of the Rumah Kost or Apart Kost Admin gallery.
There are no Lobby, Kitchen, Shared Area, or other mandatory photo-type filters.
An image may depict any relevant part of its category.

### FR-PUB-CONTENT-103 — Facilities and terms

The detail page shows:

- complete published category facilities;
- property/common facilities;
- category tariff;
- minimum 12-month lease term;
- annual-full or two-month installment explanation;
- DP minimum;
- security-deposit explanation;
- payment method statement;
- one-person/one-room and gender policy;
- house-rule highlights;
- move-in planning window;
- cancellation/hold disclaimer;
- location and contact; and
- links to the complete published terms.

DP and security deposit must be presented as different concepts. Public copy
must not state that DP is refundable security or that the security deposit
reduces rent.

### FR-PUB-PUBLIC-104 — Category CTA

The persistent primary action is **Ajukan Minat Booking**. It opens a short
lead form in the category context. The CTA must remain understandable on mobile
without covering essential content.

Before submission, copy states:

- this is an expression of interest;
- an Admin will confirm availability and contact the candidate;
- no room number is selected;
- no room becomes held or reserved;
- no payment is requested by this form; and
- a lease begins only after later verification and onboarding.

## 5. Public Short Lead Form

### FR-PUB-LEAD-101 — Minimum lead fields

The public form collects only information needed for first contact:

- full name;
- active phone/WhatsApp;
- email, when available;
- gender: Putra or Putri;
- category: Rumah Kost or Apart Kost;
- intended start date or “Belum ditentukan”;
- university, optional;
- short question/message, optional; and
- privacy/contact consent.

It must not collect:

- NIK or identity files;
- complete address;
- parent/emergency contacts;
- password;
- bank or payment proof;
- exact room;
- exact building;
- lease signature; or
- security-deposit/DP transaction data.

Complete resident data is collected only during Admin onboarding after
agreement.

### FR-PUB-LEAD-102 — Lead validation and submission

The form normalizes Indonesian phone input, trims textual values, validates
date/contact fields, keeps an entered intended start within the ordinary
application-to-move-in window of at most two months, and preserves the entered
draft after a recoverable error. It sends the selected category and gender but
never a room identifier.

Double submission is prevented. One logical retry uses the same idempotency
identity. A changed form uses a new logical identity.

### FR-PUB-LEAD-103 — Lead result

Success shows:

- safe business reference;
- submitted category and gender;
- expected follow-up statement;
- Admin contact action when configured;
- **Kembali ke Katalog**; and
- an explicit “belum menjadi reservasi” reminder.

The success page does not expose internal lead, room, property, or user IDs.
Duplicate replay returns the same safe result rather than creating another lead.

### FR-PUB-LEAD-104 — Public privacy

Public lead data must not enter URL parameters, analytics payloads, console
output, client persistence, or generated page metadata. Error copy must not
echo raw API responses or reveal whether an email/phone already belongs to a
resident.

## 6. Penghuni Authentication and Account Activation

### FR-PEN-AUTH-101 — Login

`/login` accepts:

- email or Indonesian phone number; and
- password.

Phone variants beginning `08`, `628`, or `+628` resolve through the canonical
normalization rule. The form uses an exact password input label so the
show/hide-password control cannot become an ambiguous field target.

Protected pages require a user carrying the exact `resident` role. A mixed-role
account that includes `resident` may use the Penghuni app; a non-resident
account fails closed after auth loading completes.

### FR-PEN-AUTH-102 — First-login credential flow

A newly committed resident account receives a temporary password through an
authorized manual handoff. The Admin obtains it only from the dedicated,
non-cacheable one-time receipt produced by the successful onboarding command.
On first login:

1. credentials are verified;
2. the user must set and confirm a new password;
3. all other protected navigation remains blocked;
4. successful change invalidates the temporary credential and old sessions;
5. the user continues to Home.

Passwords are never rendered after that receipt is dismissed, returned by an
ordinary/profile endpoint, stored in browser persistence, or sent through a
reminder.

For a future-start agreement, successful password change does not create
occupancy early. Until **Activate Lease** succeeds, the account may see only the
password-change flow and the strict safe result from
`GET /my/onboarding-status`; canonical resident context and operational Home
data remain unavailable.

### FR-PEN-AUTH-103 — Recovery and account states

The app must handle:

- invalid credentials;
- temporary password requiring change;
- active account with no eligible resident context;
- ambiguous resident context;
- inactive/archived resident;
- ended lease;
- revoked property membership;
- expired session; and
- offline/recoverable network failure.

Forgot/reset password may initially use an Admin-mediated reset flow, but the
login screen must provide a truthful contact path rather than a nonfunctional
link.

## 7. Protected Penghuni Navigation

The protected mobile-first navigation is:

| Route            | Label      | Primary job                                       |
| ---------------- | ---------- | ------------------------------------------------- |
| `/`              | Beranda    | Current room, lease, bill, and quick actions      |
| `/billing`       | Tagihan    | Invoices, manual proof, receipts, deposit summary |
| `/complaints`    | Komplain   | Submit and track maintenance complaints           |
| `/notifications` | Notifikasi | Resident-visible operational events               |
| `/profile`       | Profil     | Identity, lease context, account, and more links  |

Secondary routes reached from Profile or Home:

- `/vehicles` — own registered vehicles and parking;
- `/info` — published property information, facilities, rules, FAQ, and contact;
- `/lease` — full current lease and room information when a distinct page is
  needed;
- `/documents` — authorized lease, invoice, receipt, and handover documents; and
- `/chat` only when a real, enabled communication authority exists.

Unavailable placeholder routes must be hidden. Contact Admin may use a manual
WhatsApp action instead of claiming that in-app chat exists.

### FR-PEN-RESIDENT-101 — Canonical resident context

Home, Profile, Billing, Complaints, Vehicles, and Notifications use the same
account-isolated resident context. The client must not infer room/property from
an invoice, auth fallback, URL parameter, or cached previous account.

Context results are:

- one eligible active context: render protected content;
- zero eligible context: safe unavailable state with contact guidance;
- multiple eligible contexts: conflict state and no guessed selection; and
- forbidden/expired: clear protected cache and return to the appropriate auth
  state.

## 8. Penghuni Home

### FR-PEN-RESIDENT-102 — Home overview

Home shows:

- resident greeting;
- current room and category;
- lease start/end and remaining days;
- payment plan;
- current/next invoice status and amount;
- security-deposit status separately from rent;
- open complaint count;
- current parking/vehicle summary when present;
- unread notification count; and
- published urgent property notices.

Quick actions are **Lihat Tagihan**, **Buat Komplain**, **Kendaraan Saya**,
**Informasi Kost**, and **Hubungi Admin** when configured.

Billing content must remain independently usable if resident profile enrichment
is temporarily unavailable; errors in one card cannot blank the entire Home.

### FR-PEN-REMINDER-101 — Resident-facing due and lease notices

Home and Notifications may show distinct milestones:

- invoice due reminder;
- payment proof awaiting review;
- H-60 renewal-intent notice;
- H-30 renewal/payment-work notice;
- H-14 checkout-preparation notice;
- checkout/renewal action requested; and
- security-deposit refund progress.

The app must distinguish these concerns. Paying an invoice does not imply lease
renewal; a lease renewal does not mark unpaid invoices as paid.

## 9. Penghuni Billing and Manual Payment

### FR-PEN-BILLING-101 — Billing overview

`/billing` contains:

- outstanding total;
- paid rent total;
- current/next invoice;
- DP received and rent allocation;
- security deposit held/refund state;
- invoice history; and
- payment/receipt history.

Invoice statuses use clear Indonesian labels and include amount, period, due
date, paid allocation, outstanding balance, and action. A resident sees only
their authorized records.

### FR-PEN-PAYMENT-101 — Manual transfer proof

There is no payment-gateway CTA under `DEC-PAYMENT-001`.

For an eligible unpaid invoice, the resident may submit:

- selected invoice;
- transfer date;
- transfer amount;
- originating bank/account-name information limited to what Admin needs;
- image/PDF proof;
- notes, optional; and
- confirmation.

The app displays the configured destination bank details, but never provider
secrets. Proof preview is available before submission.

Submission creates **Menunggu Verifikasi**, not **Lunas**. The invoice becomes
paid only after Admin verification and allocation.

Cash payment is recorded by Admin. The resident can see its verified receipt
afterward but cannot self-attest cash payment.

### FR-PEN-PAYMENT-102 — Proof and receipt states

The resident can distinguish:

- invoice unpaid;
- proof pending review;
- proof rejected with safe reason;
- partially paid;
- verified paid;
- reversed/corrected; and
- void/cancelled invoice.

Duplicate proof submission for the same unresolved invoice is prevented or
explicitly versioned. Rejected proof may be replaced without losing its audit
history.

### FR-PEN-PAYMENT-103 — Secure documents

Invoice and receipt downloads use authenticated, expiring mediated links. The
link:

- is generated for the current resident and document;
- does not contain a reusable credential;
- expires;
- cannot be used to enumerate another resident's document; and
- produces a user-facing unavailable state if revoked or expired.

The same secure link authority can be included in an Admin-generated reminder.

## 10. Penghuni Profile, Lease, and Property Information

### FR-PEN-RESIDENT-103 — Profile

Profile shows:

- full name;
- email;
- normalized phone/WhatsApp;
- gender;
- birth place/date;
- address;
- university, faculty/major, and cohort;
- Instagram username when provided;
- parent/guardian contact;
- emergency contact;
- account status; and
- current room/property context.

Sensitive identity data such as NIK and KTP is masked and not repeatedly
downloadable by default. The resident may update a limited set of contact and
education fields; identity and lease-bound fields require Admin review.

Profile actions include change password, notification preference, Information
Kost, Kendaraan Saya, and logout.

### FR-PEN-LEASE-101 — Lease and room information

The lease view shows:

- business lease reference;
- room/category;
- gender policy;
- facilities;
- start/end;
- duration;
- payment plan;
- category tariff snapshot;
- DP and security-deposit terms;
- move-in/check-in status;
- renewal/checkout guidance; and
- authorized lease document.

It does not expose building ownership internals, other rooms, other residents,
or Admin notes.

### FR-PEN-CONTENT-101 — Information Kost

`/info` uses the currently published Admin content:

- property profile and contact;
- category and common facilities;
- house rules and complete terms;
- visitor, security, parking, and energy rules;
- payment and deposit explanation;
- complaint SLA;
- emergency contacts; and
- FAQ.

Published updates must replace the prior version consistently. Offline cached
content must indicate when it was last updated.

## 11. Penghuni Complaints

### FR-PEN-COMPLAINT-101 — Complaint list and detail

`/complaints` lists the resident's complaints with code, category, priority,
room, status, submitted time, last update, and SLA guidance.

Complaint detail shows description, resident-visible attachments, timeline,
assigned-work status, Admin/technician public updates, completion evidence when
permitted, and reopen/follow-up action when the lifecycle allows.

Internal notes, technician private contact, expenses, raw work-order rows, and
other residents are not shown.

### FR-PEN-COMPLAINT-102 — Submit complaint

The form captures:

- current room, read-only;
- complaint category;
- priority guidance;
- occurrence time;
- description;
- photo/video evidence within file limits; and
- emergency guidance.

The resident cannot select another room or property. Successful submission
returns a safe complaint reference and status. A suspected emergency displays
the published emergency contact in addition to submission.

## 12. Penghuni Vehicles and Parking

### FR-PEN-VEHICLE-101 — Own vehicles

`/vehicles` shows only vehicles linked to the current resident and lease:

- vehicle type;
- plate;
- make/model and color;
- registration state;
- parking assignment; and
- document status.

The resident may propose Add/Edit/Archive when enabled. Admin remains authority
for approval and parking assignment.

### FR-PEN-VEHICLE-102 — Vehicle form

The form captures type, plate, make/model, color, ownership relationship, and
required documents. It normalizes the plate, previews files before upload, and
prevents duplicate active registration. It never permits choosing another
resident, room, or parking slot.

## 13. Penghuni Notifications and Communication

### FR-PEN-NOTIFICATION-101 — Notification center

`/notifications` includes resident-visible events such as:

- invoice issued/due/verified/rejected;
- lease ending/renewed/closed;
- complaint/work-order updates;
- vehicle/parking approval;
- property notice; and
- account/security event.

Each item has explicit title, safe summary, timestamp, read state, and a deep
link to the authorized detail. Resolved underlying conditions update actionable
badges; immutable history remains visible.

### FR-PEN-REMINDER-102 — Communication truth

Manual WhatsApp opened by Admin is not represented as delivered or read in the
Penghuni app. Email remains provider-disabled until configured. The app may show
an internal notice generated from the same invoice/lease event, but must label
it as an in-app notification rather than an external delivery receipt.

### FR-PEN-INTEGRATION-101 — Contact Admin

Until real in-app messaging is implemented, **Hubungi Admin** opens the
configured WhatsApp number with safe context that excludes NIK, identity files,
tokens, and opaque IDs. Missing contact configuration produces a truthful
unavailable state.

## 14. Shared Experience and Failure Behavior

### NFR-A11Y-003 — Public and Penghuni accessibility

- All pages have one clear heading and logical landmarks.
- Form controls have visible labels; placeholders are supplemental.
- Gallery, tabs, disclosures, file previews, and bottom navigation work by
  keyboard and screen reader.
- Focus is moved into and restored from dialogs/sheets.
- Error text is linked to the affected field.
- Status never relies only on color.
- Interactive targets are at least 44px on the mobile surface.

### NFR-REL-002 — Account and cache isolation

Public cache contains only published public data. Authenticated cache keys
include account identity and are cleared synchronously on logout, auth failure,
or account switch. A prior resident's profile, invoice, proof, complaint,
vehicle, or notification may never flash for the next account.

### NFR-PERF-002 — Mobile and media performance

- Public images use responsive sizes and lazy loading below the fold.
- The cover image and essential text do not wait for the entire gallery.
- Penghuni lists use bounded pagination.
- File previews use local object URLs safely and release them.
- Background refresh preserves usable terminal content.
- Vite/HMR or auth-bootstrap noise is not treated as page readiness.

### NFR-PRIV-002 — Public and resident minimization

Public responses contain only published category/property content and safe
aggregates. Penghuni responses contain only the authenticated resident's
authorized fields. Neither surface renders opaque IDs, internal metadata,
provider payloads, audit snapshots, or unrelated PII.

## 15. Acceptance Journeys

### Journey A — Public interest

1. Visitor opens `/kamar` without login.
2. Visitor filters to Apart Kost and Putri, selects intended start, and opens
   category detail.
3. Visitor sees gallery, facilities, category pricing, minimum term, DP,
   deposit, and terms.
4. Visitor submits the short lead without choosing a room.
5. Success confirms follow-up and explicitly says no room is reserved.
6. Admin receives one property-scoped lead.

### Journey B — New resident first login

1. Admin completes the canonical onboarding commitment and hands off a temporary
   credential from its one-time receipt.
2. Resident signs in with email or normalized phone.
3. Resident must change password.
4. A future-start resident sees only the safe upcoming state until activation.
5. After canonical activation, Home shows the correct active room, lease, and
   current billing state.
6. Switching accounts clears the previous resident's data before render.

### Journey C — Manual payment proof

1. Resident opens an unpaid invoice.
2. Resident sees bank details and uploads proof.
3. Submission becomes Menunggu Verifikasi and does not mark the invoice paid.
4. Admin verifies or rejects.
5. Resident sees updated status, allocation, and receipt when verified.

### Journey D — Complaint

1. Resident submits a complaint for the canonical current room.
2. Safe reference and submitted status are shown.
3. Admin dispatch and work-order progress appear as resident-visible updates.
4. Completion remains in history and can be reopened only when permitted.

### Journey E — Lease ending

1. Home and Notifications show H-60 renewal intent, H-30 renewal/payment work,
   and H-14 checkout preparation as distinct milestones.
2. Paying an invoice clears the unpaid flag but not the lease-ending notice.
3. Renewal or checkout resolution updates the relevant milestone notice.
4. Resident can still access historical invoices and receipts according to
   retention policy.

## 16. Completion Gate

The Public and Penghuni experience is not complete until:

1. public `/kamar` works without authentication and reveals no exact room;
2. both categories derive gallery, facilities, terms, and pricing from Admin
   publication authorities;
3. the lead form remains short and creates no account, hold, or lease;
4. resident credentials work with email/phone and force first-password change;
5. every protected page uses canonical resident context and account-isolated
   cache;
6. Home, Profile, Billing, Complaints, Vehicles, Notifications, and Info provide
   explicit loading, zero, denied, conflict, invalid, and retry states;
7. payment remains manual and proof review does not auto-settle an invoice;
8. secure invoice/receipt access cannot cross resident scope;
9. mobile 390px and desktop public layouts have no page overflow, unreachable
   action, or hidden required content; and
10. runtime evidence validates public, authenticated, account-switch, file,
    responsive, dark/light, and accessibility paths before requirements advance
    beyond APPROVED.
