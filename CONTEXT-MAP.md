# Kostation Context Map

## Contexts

- [Kost Management Ecosystem](docs/21-kost-management-ecosystem-overhaul/CONTEXT.md): canonical language for rooms, leases, occupancy, payments, Property Owner rights, reporting, and related operational workflows across the API, Admin, and Penghuni applications.

## Relationships

- **Admin → API**: Admin records and manages operational and financial actions through authoritative API commands.
- **Penghuni → API**: Penghuni reads resident-scoped records and performs explicitly permitted resident actions through the API.
- **Property Owner Portal → API**: the portal reads asset-scoped ownership, contract progress, earned-income, settlement, and payout information without receiving operational mutation authority.
- **Shared domain → all applications**: canonical terms, financial boundaries, and lifecycle rules apply consistently across API responses, interfaces, documents, exports, and reports.

