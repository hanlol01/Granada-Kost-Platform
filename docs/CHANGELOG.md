# Changelog

## 2026-06-17

### Backend Foundation
- NestJS bootstrap
- PostgreSQL foundation
- Redis foundation
- Health Check
- Validation
- Exception Filter
- Logger

### IAM + RBAC
- Users
- Roles
- Permissions
- User Sessions
- JWT Auth
- Refresh Token Rotation
- Audit Logs

### Property + Room
- Property Module
- Room Module
- Property owner read-only scope
- Room availability endpoint
- Room master fields: `unit_code`, `gender_policy`

### Resident + Occupancy
- Resident Module
- Emergency Contacts
- Occupancy Module
- Check-in and Check-out foundation
- Occupancy history
- Room status sync with active occupancy

### Seed Data
- Core seed Layer 0-4
- Master room seed Layer 5: 163 rooms
- Development seed Layer 6: 10 dummy residents, 8 active occupancies
- Seed validation checks

### Billing
- Billing migration
- Billing repository and service foundation
- Billing API Phase 1
- Development billing seed and workflow validation

### Complaint + Maintenance
- Complaint and maintenance migration
- Repository and service foundation
- Complaint and work order API Phase 1
- Complaint category seed: 10 categories
- Development technician, complaint, and work order seed
- Complaint workflow validation script

## 2026-06-18

### Vehicle + Parking
- Vehicle and parking migration
- Repository, service, helper, and audit foundation
- Vehicle and parking API Phase 1
- Development vehicle seed: 9 dummy vehicles
- Development parking seed: 3 zones and 6 slots
- Vehicle and parking workflow validation script
- Build, lint, dev seed, and workflow validation passed

## 2026-06-19

### Notification
- Notification migration
- Repository, service, provider abstraction, helper, template, and audit foundation
- Notification API Phase 1
- Development notification preference seed: 5 users
- Development in-app notification seed: 8 samples
- Development delivery seed: 5 Brevo email dummy records
- Notification workflow validation script
- Build, lint, dev seed, and workflow validation passed
