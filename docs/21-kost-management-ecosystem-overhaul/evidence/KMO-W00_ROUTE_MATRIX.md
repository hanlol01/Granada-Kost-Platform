# KMO-W00 Route Integrity Evidence

Status: source-contract verified; authenticated browser evidence deferred because no process-only QA credential was available.

## Scope and authority

KMO-W00 freezes route truth without claiming later overhaul waves as shipped. Registration proof follows `getRouter()` into the production `routeTree`, then verifies the connected route module declaration and Admin registry target. Access remains governed by the existing role, capability, and feature boundaries. The generated tree is a protected baseline artifact and is never the sole evidence source.

## Corrected route contracts

| Surface    | Canonical contract                                                                                                                | Terminal behavior                                                                                                                                   | Delivery owner                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Vehicles   | `/vehicles?tab=vehicles` or `/vehicles?tab=parking`; omitted, blank, unknown, and malformed values canonicalize deterministically | Visible Vehicles/Parking tabs remain synchronized with the URL; `/parking` redirects to the canonical parking tab                                   | KMO-W00 / W09 continuation        |
| Complaints | `/complaints`                                                                                                                     | Loading, ready, empty, forbidden, recoverable error, and invalid-response states terminate safely; retries cover complaints and category references | KMO-W00 / M16 authority preserved |
| Reports    | `/reports`                                                                                                                        | Honest unavailable state; no fabricated report is derived from unrelated live endpoints while `/reports/leases` is absent                           | KMO-W10                           |
| Facilities | `/rooms/fasilitas` with optional `q`, `category_id`, and `kost_type_id`                                                           | Empty search is valid; text is trimmed/bounded; malformed identifiers are removed; URL and state converge without a loop                            | KMO-W00 / W02 content deferred    |

## Admin route inventory

| Route                                     | Registration / navigation                   | Access authority                                                                    | Query / legacy rule                                 | Classification                                           |
| ----------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `/login`                                  | Registered; public, not sidebar             | Public route boundary                                                               | None                                                | Live authentication entry                                |
| `/`                                       | Registered and visible                      | owner/manager/admin; `room.read`, `lease.read`, `billing.read`                      | None                                                | Live dashboard                                           |
| `/rooms`                                  | Registered group and summary                | owner/manager/admin/property_owner; `room.read`; Admin UX master rollout            | Server pagination and category filters              | Live property-scoped inventory                           |
| `/rooms/rumah-kost`                       | Registered and visible under Rooms          | Same read boundary; write actions additionally require `room.manage`                | Category-fixed                                      | Live category inventory                                  |
| `/rooms/apart-kost`                       | Registered and visible under Rooms          | Same read boundary; write actions additionally require `room.manage`                | Category-fixed                                      | Live category inventory                                  |
| `/rooms/fasilitas`                        | Registered and visible under Rooms          | Same Rooms boundary                                                                 | Canonical optional search keys                      | Live safe terminal; W02 content work remains             |
| `/rooms/galeri`                           | Registered and visible under Rooms          | Same Rooms boundary                                                                 | None                                                | Live Rooms child                                         |
| `/syarat-ketentuan`                       | Registered and visible under Rooms          | Same Rooms boundary                                                                 | None                                                | Live Rooms child                                         |
| `/penyewaan`                              | Registered and visible                      | owner/manager/admin; `lease.read`; lease rollout                                    | Existing list/search contract                       | Existing lease surface; later IA consolidation deferred  |
| `/penyewaan/tambah`                       | Registered, not sidebar                     | Existing lease create access and write gate                                         | Direct route                                        | Live command surface                                     |
| `/penyewaan/$leaseId`                     | Registered, not sidebar                     | Existing lease detail access                                                        | Route parameter plus detail search state            | Live detail surface                                      |
| `/tenants`                                | Registered and visible                      | owner/manager/admin; `resident.read`                                                | Existing search state                               | Live resident surface                                    |
| `/payments`                               | Registered and visible                      | owner/manager/admin; `billing.read`                                                 | Existing tab/query contract                         | Live billing and stored-transaction reads                |
| `/vehicles`                               | Registered and visible                      | owner/manager/admin; any of `vehicle.manage` or `parking.manage`                    | Canonical `tab=vehicles` or `tab=parking`           | Live capability-scoped two-tab workspace                 |
| `/parking`                                | Registered compatibility route, not sidebar | Same role boundary; destination tab remains capability-scoped                       | Redirects to `/vehicles?tab=parking`                | Legacy compatibility                                     |
| `/booking-leads`                          | Registered and visible                      | manager/admin                                                                       | Existing lead/hold feature gates inside the surface | Live booking-interest workspace                          |
| `/complaints`                             | Registered and visible                      | owner/manager/admin plus `complaint.manage`; assign also needs `maintenance.manage` | Existing category/status UI state                   | Live safe terminal and M16 dispatch UI                   |
| `/reports`                                | Registered and visible                      | owner/manager/admin                                                                 | No fabricated report query                          | Explicit unavailable terminal; W10 owns report authority |
| `/notifications`                          | Registered and visible                      | owner/manager/admin; `notification.manage`                                          | Existing notification filters                       | Live notifications                                       |
| `/settings`                               | Registered and visible                      | owner/manager; `property.manage`                                                    | Property/account settings state                     | Live persistent settings                                 |
| `/booking`, `/bookings`                   | Registered, hidden from normal navigation   | Existing booking feature/access boundary                                            | Compatibility surfaces                              | Conditional/deferred                                     |
| `/smart-lock`, `/access-history`, `/cctv` | Registered conditionally                    | Existing feature and route access boundaries                                        | No fallback port/route                              | Explicit feature-disabled or live state                  |
| `/hunian-gallery`                         | Registered compatibility route              | Protected route boundary                                                            | Redirects to Rooms gallery                          | Legacy compatibility                                     |

`/reports/leases` is not registered. It remains a planned KMO-W10 authority and is not presented as a shipped route.

## Public and Penghuni inventory

| Actor    | Route            | Boundary                          | Classification                             |
| -------- | ---------------- | --------------------------------- | ------------------------------------------ |
| Public   | `/kamar`         | No authenticated resident context | Live public catalog                        |
| Public   | `/kamar/$slug`   | No authenticated resident context | Live public catalog detail                 |
| Penghuni | `/login`         | Public login route                | Live authentication entry                  |
| Penghuni | `/`              | Authenticated resident shell      | Live home using canonical resident context |
| Penghuni | `/billing`       | Authenticated resident shell      | Live read surface / safe empty state       |
| Penghuni | `/complaints`    | Authenticated resident shell      | Existing complaint surface                 |
| Penghuni | `/info`          | Authenticated resident shell      | Existing property information surface      |
| Penghuni | `/notifications` | Authenticated resident shell      | Existing notification surface              |
| Penghuni | `/profile`       | Authenticated resident shell      | Live canonical self-context profile        |
| Penghuni | `/chat`          | Authenticated resident shell      | Explicit placeholder/deferred terminal     |

`/kamar-admin` and `/kamarnya` are not canonical public catalog routes.

## Property owner boundary

`property_owner` currently receives the Admin Rooms read workspace and its registered child routes through the existing property-scoped `room.read` boundary. Mutation controls remain governed separately by mutation capabilities and are not granted by route visibility. Broader owner dashboards, residents, billing, reports, and settings are KMO-W10 decisions; W00 does not expose or imply those routes for `property_owner`.

## Navigation integrity

- Desktop sidebar, mobile navigation, breadcrumbs, and route access consume the same Admin route metadata.
- Registry search state is forwarded by both desktop and mobile links.
- Visible registry routes must resolve through `getRouter()`, the connected production tree, and the matching source declaration; tree removal, decoy declarations, and registry path drift fail the focused contract.
- The mobile "Lainnya" sheet excludes routes already rendered as primary bottom-navigation items.
- The W00 patch tightens Complaints visibility to the capability already required by the live API; no role, capability, property scope, or feature rollout was widened.

## Read-only database baseline

Connected target was the local development database `kostation_demo_pg3`. No database mutation was executed.

| Invariant                                         |                             Observed |
| ------------------------------------------------- | -----------------------------------: |
| Properties                                        |                                    1 |
| Rooms / authoritative buildings / linked rooms    |                       163 / 26 / 163 |
| Room status                                       | 8 occupied / 2 reserved / 153 vacant |
| Active occupancies / active leases                |                                8 / 0 |
| Booking leads / active holds                      |                                4 / 2 |
| Invoices / payments                               |                                8 / 0 |
| Complaints / work orders                          |                               10 / 7 |
| Vehicles / parking slots / occupied parking slots |                            9 / 6 / 4 |
| Feature rows                                      |                                    1 |
| Admin UX read / booking hold write                |                    enabled / enabled |
| Lease write / transfer / scheduler                |       disabled / disabled / disabled |

## Evidence boundary

- Focused source/behavior contract: 6/6 PASS after a valid RED against the former route wiring.
- Relevant route/access regressions: M3/M6/M7/M17 49/49 PASS; M18 11/11 PASS.
- Full Admin tests: 154/154 PASS; typecheck, lint (zero errors), and build PASS.
- Aggregate read-only recovery gate: 12/12 PASS with schema `1`, gate `m8-read-only-recovery`, valid SHA-256 hashes, and no raw output or credential-bearing fields; evidence is stored under the OS temporary directory.
- Authenticated desktop/mobile runtime: `DEFERRED — CREDENTIAL`; no credential workaround, browser action, service control, or domain request was performed.
- Later KMO waves remain planned unless separately evidenced; this matrix does not mark W01–W12 outcomes as shipped.
