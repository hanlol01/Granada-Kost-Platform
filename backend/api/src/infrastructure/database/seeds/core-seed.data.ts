export type SeedEnvironment = 'development' | 'production';
export type RoomGenderPolicy = 'male' | 'female';
export type RoomSeedRecord = {
  number: string;
  unitCode: string;
  genderPolicy: RoomGenderPolicy;
  roomTypeName: 'RuKost Standard' | 'ApartKost Standard';
};
export type DevResidentSeedRecord = {
  id: string;
  userId: string;
  fullName: string;
  gender: RoomGenderPolicy;
  status: 'active' | 'inactive';
  email: string;
  phone: string;
  ktpNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};
export type DevOccupancySeedRecord = {
  id: string;
  residentId: string;
  roomNumber: string;
};
export type DevBillingInvoiceSeedRecord = {
  id: string;
  occupancyId: string;
};
export type ComplaintCategorySeedRecord = {
  id: string;
  code: string;
  name: string;
  defaultPriority: 'low' | 'medium' | 'high' | 'urgent';
  description: string;
  sortOrder: number;
};
export type DevUserSeedRecord = {
  id: string;
  email: string;
  displayName: string;
  roleCode: 'admin' | 'technician' | 'property_owner';
  phone?: string;
};
export type DevTechnicianSeedRecord = {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  skillTags: string;
};
export type DevComplaintSeedRecord = {
  id: string;
  code: string;
  residentId: string;
  roomNumber?: string;
  categoryCode: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'submitted' | 'acknowledged' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'cancelled';
  assignedTechnicianKey?: keyof typeof CORE_SEED_IDS.devUsers.technicians;
  locationNote?: string;
};
export type DevWorkOrderSeedRecord = {
  id: string;
  code: string;
  complaintId?: string;
  roomNumber?: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'verified' | 'cancelled';
  assignedTechnicianKey?: keyof typeof CORE_SEED_IDS.devUsers.technicians;
};
export type DevVehicleSeedRecord = {
  id: string;
  code: string;
  residentId: string;
  roomNumber: string;
  plateNumber: string;
  vehicleType: 'motorcycle' | 'car';
  brand: string;
  color: string;
  year?: string;
  status: 'active' | 'pending_approval' | 'suspended';
};
export type DevParkingZoneSeedRecord = {
  id: string;
  zoneCode: string;
  zoneName: string;
  zoneType: 'motorcycle' | 'car' | 'mixed';
  capacity: number;
  locationDescription: string;
  sortOrder: number;
};
export type DevParkingSlotSeedRecord = {
  id: string;
  zoneKey: keyof typeof CORE_SEED_IDS.devParkingZones;
  slotNumber: string;
  slotType: 'motorcycle' | 'car';
  vehicleId?: string;
};

export const CORE_SEED_IDS = {
  ownerUser: '10000000-0000-4000-8000-000000000001',
  granadaProperty: '20000000-0000-4000-8000-000000000001',
  roomTypes: {
    rukostStandard: '30000000-0000-4000-8000-000000000001',
    apartkostStandard: '30000000-0000-4000-8000-000000000002',
  },
  facilities: {
    ac: '40000000-0000-4000-8000-000000000001',
    kasur: '40000000-0000-4000-8000-000000000002',
    lemari: '40000000-0000-4000-8000-000000000003',
    wifi: '40000000-0000-4000-8000-000000000004',
    kamarMandiDalam: '40000000-0000-4000-8000-000000000005',
    meja: '40000000-0000-4000-8000-000000000006',
    kursi: '40000000-0000-4000-8000-000000000007',
    waterHeater: '40000000-0000-4000-8000-000000000008',
  },
  devResidents: {
    alpha: '50000000-0000-4000-8000-000000000001',
    bravo: '50000000-0000-4000-8000-000000000002',
    charlie: '50000000-0000-4000-8000-000000000003',
    delta: '50000000-0000-4000-8000-000000000004',
    echo: '50000000-0000-4000-8000-000000000005',
    foxtrot: '50000000-0000-4000-8000-000000000006',
    golf: '50000000-0000-4000-8000-000000000007',
    hotel: '50000000-0000-4000-8000-000000000008',
    inactiveOne: '50000000-0000-4000-8000-000000000009',
    inactiveTwo: '50000000-0000-4000-8000-000000000010',
  },
  devResidentUsers: {
    alpha: '51000000-0000-4000-8000-000000000001',
    bravo: '51000000-0000-4000-8000-000000000002',
    charlie: '51000000-0000-4000-8000-000000000003',
    delta: '51000000-0000-4000-8000-000000000004',
    echo: '51000000-0000-4000-8000-000000000005',
    foxtrot: '51000000-0000-4000-8000-000000000006',
    golf: '51000000-0000-4000-8000-000000000007',
    hotel: '51000000-0000-4000-8000-000000000008',
    inactiveOne: '51000000-0000-4000-8000-000000000009',
    inactiveTwo: '51000000-0000-4000-8000-000000000010',
  },
  devOccupancies: {
    alpha: '60000000-0000-4000-8000-000000000001',
    bravo: '60000000-0000-4000-8000-000000000002',
    charlie: '60000000-0000-4000-8000-000000000003',
    delta: '60000000-0000-4000-8000-000000000004',
    echo: '60000000-0000-4000-8000-000000000005',
    foxtrot: '60000000-0000-4000-8000-000000000006',
    golf: '60000000-0000-4000-8000-000000000007',
    hotel: '60000000-0000-4000-8000-000000000008',
  },
  devBilling: {
    bsiPaymentAccount: '70000000-0000-4000-8000-000000000001',
    currentBillingPeriod: '71000000-0000-4000-8000-000000000001',
    invoices: {
      alpha: '72000000-0000-4000-8000-000000000001',
      bravo: '72000000-0000-4000-8000-000000000002',
      charlie: '72000000-0000-4000-8000-000000000003',
      delta: '72000000-0000-4000-8000-000000000004',
      echo: '72000000-0000-4000-8000-000000000005',
      foxtrot: '72000000-0000-4000-8000-000000000006',
      golf: '72000000-0000-4000-8000-000000000007',
      hotel: '72000000-0000-4000-8000-000000000008',
    },
  },
  complaintCategories: {
    ac: '80000000-0000-4000-8000-000000000001',
    water: '80000000-0000-4000-8000-000000000002',
    electricity: '80000000-0000-4000-8000-000000000003',
    internet: '80000000-0000-4000-8000-000000000004',
    roomFacility: '80000000-0000-4000-8000-000000000005',
    cleanliness: '80000000-0000-4000-8000-000000000006',
    security: '80000000-0000-4000-8000-000000000007',
    commonFacility: '80000000-0000-4000-8000-000000000008',
    noise: '80000000-0000-4000-8000-000000000009',
    other: '80000000-0000-4000-8000-000000000010',
  },
  devUsers: {
    admin: '81000000-0000-4000-8000-000000000001',
    propertyOwner: '81000000-0000-4000-8000-000000000002',
    technicians: {
      budi: '81000000-0000-4000-8000-000000000011',
      anto: '81000000-0000-4000-8000-000000000012',
      rudi: '81000000-0000-4000-8000-000000000013',
    },
  },
  devTechnicianProfiles: {
    budi: '82000000-0000-4000-8000-000000000001',
    anto: '82000000-0000-4000-8000-000000000002',
    rudi: '82000000-0000-4000-8000-000000000003',
  },
  devComplaints: {
    acInProgress: '83000000-0000-4000-8000-000000000001',
    waterResolved: '83000000-0000-4000-8000-000000000002',
    internetSubmitted: '83000000-0000-4000-8000-000000000003',
    corridorAcknowledged: '83000000-0000-4000-8000-000000000004',
    gateOnHold: '83000000-0000-4000-8000-000000000005',
    wallClosed: '83000000-0000-4000-8000-000000000006',
    parkingCancelled: '83000000-0000-4000-8000-000000000007',
    acLeakInProgress: '83000000-0000-4000-8000-000000000008',
    noiseSubmitted: '83000000-0000-4000-8000-000000000009',
    electricityResolved: '83000000-0000-4000-8000-000000000010',
  },
  devWorkOrders: {
    acService: '84000000-0000-4000-8000-000000000001',
    waterRepair: '84000000-0000-4000-8000-000000000002',
    gateRepair: '84000000-0000-4000-8000-000000000003',
    acLeak: '84000000-0000-4000-8000-000000000004',
    electricityCheck: '84000000-0000-4000-8000-000000000005',
    lobbyLamp: '84000000-0000-4000-8000-000000000006',
    pumpInspection: '84000000-0000-4000-8000-000000000007',
  },
  devVehicles: {
    alphaMotor: '85000000-0000-4000-8000-000000000001',
    alphaCar: '85000000-0000-4000-8000-000000000002',
    bravoMotor: '85000000-0000-4000-8000-000000000003',
    charlieMotor: '85000000-0000-4000-8000-000000000004',
    deltaCar: '85000000-0000-4000-8000-000000000005',
    echoMotor: '85000000-0000-4000-8000-000000000006',
    foxtrotMotor: '85000000-0000-4000-8000-000000000007',
    golfCar: '85000000-0000-4000-8000-000000000008',
    hotelMotor: '85000000-0000-4000-8000-000000000009',
  },
  devParkingZones: {
    motorcycleFront: '86000000-0000-4000-8000-000000000001',
    motorcycleBack: '86000000-0000-4000-8000-000000000002',
    carMain: '86000000-0000-4000-8000-000000000003',
  },
  devParkingSlots: {
    motorcycleFront01: '87000000-0000-4000-8000-000000000001',
    motorcycleFront02: '87000000-0000-4000-8000-000000000002',
    motorcycleFront03: '87000000-0000-4000-8000-000000000003',
    motorcycleBack01: '87000000-0000-4000-8000-000000000004',
    carMain01: '87000000-0000-4000-8000-000000000005',
    carMain02: '87000000-0000-4000-8000-000000000006',
  },
} as const;

export const ROLES = [
  ['owner', 'Owner', 'Platform/operator owner with highest access.'],
  ['manager', 'Manager', 'Operational manager with broad property operations.'],
  ['admin', 'Admin', 'Daily administrative staff.'],
  ['technician', 'Technician', 'Maintenance staff assigned to work orders.'],
  ['resident', 'Penghuni', 'Penghuni using the resident PWA.'],
  ['property_owner', 'Pemilik Rumah Kost', 'Read-only property owner/investor scoped to owned properties.'],
] as const;

export const PERMISSIONS = [
  ['rbac.manage', 'Manage RBAC', 'Manage roles, permissions, and property role assignment.'],
  ['audit.view', 'View Audit', 'View security and domain audit logs.'],
  ['audit.export', 'Export Audit', 'Export security and audit reports.'],
  ['property.read', 'Read Property', 'Read property profile and scoped property data.'],
  ['property.manage', 'Manage Property', 'Manage property profile and settings.'],
  ['room.read', 'Read Room', 'Read room data.'],
  ['room.manage', 'Manage Room', 'Create or update room operational data.'],
  ['resident.read', 'Read Penghuni', 'Read Penghuni/resident data within scope.'],
  ['resident.manage', 'Manage Penghuni', 'Create or update Penghuni/resident data.'],
  ['lease.manage', 'Manage Lease', 'Manage lease, check-in, and check-out workflows.'],
  ['checkout.manage', 'Manage Check-Out', 'Approve, inspect, and finalize check-out workflows.'],
  ['deposit.manage', 'Manage Deposit', 'Manage deposit charge, deduction, refund, and settlement.'],
  ['billing.read', 'Read Billing', 'Read billing, payment, and revenue data.'],
  ['billing.self.read', 'Read Own Billing', 'Read own billing and payment history.'],
  ['billing.manage', 'Manage Billing', 'Create or mutate billing and invoice records.'],
  ['payment.verify', 'Verify Payment', 'Verify or reject manual payment proof.'],
  ['complaint.manage', 'Manage Complaint', 'Manage complaints and work order status.'],
  ['maintenance.manage', 'Manage Maintenance', 'Manage maintenance work orders.'],
  ['vehicle.manage', 'Manage Vehicles', 'Register, approve, update, suspend, and deactivate vehicles.'],
  ['parking.manage', 'Manage Parking', 'Manage parking zones and slots.'],
  ['smart_lock.view', 'View Smart Lock', 'View smart lock metadata and security reports.'],
  ['smart_lock.command', 'Command Smart Lock', 'Execute lock or unlock commands.'],
  ['cctv.view', 'View CCTV', 'View CCTV metadata and preview sessions.'],
  ['notification.manage', 'Manage Notification', 'Manage announcements and notification content.'],
  ['report.view', 'View Report', 'View operational reports.'],
  ['report.export', 'Export Report', 'Export operational reports.'],
  ['property_owner.report.view', 'View Property Owner Report', 'Read-only property owner reports.'],
] as const;

const allPermissionCodes = PERMISSIONS.map(([code]) => code);

export const ROLE_PERMISSION_GRANTS: Array<readonly [string, string]> = [
  ...allPermissionCodes.map((permissionCode) => ['owner', permissionCode] as const),
  ...allPermissionCodes
    .filter((permissionCode) => permissionCode !== 'rbac.manage')
    .map((permissionCode) => ['manager', permissionCode] as const),
  ...[
    'property.read',
    'room.read',
    'room.manage',
    'resident.read',
    'resident.manage',
    'lease.manage',
    'checkout.manage',
    'billing.read',
    'payment.verify',
    'complaint.manage',
    'maintenance.manage',
    'vehicle.manage',
    'parking.manage',
    'smart_lock.view',
    'cctv.view',
    'notification.manage',
    'report.view',
  ].map((permissionCode) => ['admin', permissionCode] as const),
  ['technician', 'complaint.manage'],
  ['technician', 'maintenance.manage'],
  ['resident', 'property.read'],
  ['resident', 'room.read'],
  ['resident', 'billing.self.read'],
  ['property_owner', 'property.read'],
  ['property_owner', 'room.read'],
  ['property_owner', 'resident.read'],
  ['property_owner', 'billing.read'],
  ['property_owner', 'property_owner.report.view'],
];

export const GRANADA_PROPERTY = {
  id: CORE_SEED_IDS.granadaProperty,
  name: 'Granada Student House Jatinangor',
  address: 'Jl. Kiara Beres, Desa Cipacing, Kec. Jatinangor, Kab. Sumedang',
  timezone: 'Asia/Jakarta',
  status: 'active',
} as const;

export const ROOM_TYPES = [
  {
    id: CORE_SEED_IDS.roomTypes.rukostStandard,
    name: 'RuKost Standard',
    basePrice: 1800000,
    defaultDepositAmount: 0,
  },
  {
    id: CORE_SEED_IDS.roomTypes.apartkostStandard,
    name: 'ApartKost Standard',
    basePrice: 1800000,
    defaultDepositAmount: 0,
  },
] as const;

export const ROOM_FACILITIES = [
  [CORE_SEED_IDS.facilities.ac, 'AC'],
  [CORE_SEED_IDS.facilities.kasur, 'Kasur'],
  [CORE_SEED_IDS.facilities.lemari, 'Lemari'],
  [CORE_SEED_IDS.facilities.wifi, 'WiFi'],
  [CORE_SEED_IDS.facilities.kamarMandiDalam, 'Kamar Mandi Dalam'],
  [CORE_SEED_IDS.facilities.meja, 'Meja'],
  [CORE_SEED_IDS.facilities.kursi, 'Kursi'],
  [CORE_SEED_IDS.facilities.waterHeater, 'Water Heater'],
] as const;

const RUKOST_UNITS: Array<readonly [string, RoomGenderPolicy, number]> = [
  ['01', 'female', 11],
  ['02', 'male', 8],
  ['03', 'female', 8],
  ['04', 'male', 7],
  ['06', 'male', 7],
  ['07', 'male', 7],
  ['08', 'female', 7],
  ['09', 'female', 6],
  ['10', 'male', 8],
  ['11', 'male', 7],
  ['12', 'male', 7],
  ['13', 'female', 11],
  ['14', 'male', 6],
  ['15', 'female', 6],
  ['16', 'female', 7],
  ['17', 'female', 10],
];

const APARTKOST_UNITS: Array<readonly [string, RoomGenderPolicy]> = [
  ['05A', 'female'],
  ['05B', 'female'],
  ['05C', 'female'],
  ['05D', 'female'],
  ['18A', 'male'],
  ['18B', 'male'],
  ['18C', 'male'],
  ['18D', 'male'],
  ['18E', 'male'],
  ['18F', 'male'],
];

const APARTKOST_ROOM_CODES = ['1B', '2B', '3A', '4A'] as const;

export const ROOM_SEEDS: RoomSeedRecord[] = [
  ...RUKOST_UNITS.flatMap(([unitCode, genderPolicy, roomCount]) =>
    Array.from({ length: roomCount }, (_, index) => {
      const roomCode = String(index + 1).padStart(2, '0');
      return {
        number: `RK-${unitCode}-${roomCode}`,
        unitCode,
        genderPolicy,
        roomTypeName: 'RuKost Standard' as const,
      };
    }),
  ),
  ...APARTKOST_UNITS.flatMap(([unitCode, genderPolicy]) =>
    APARTKOST_ROOM_CODES.map((roomCode) => ({
      number: `AK-${unitCode}-${roomCode}`,
      unitCode,
      genderPolicy,
      roomTypeName: 'ApartKost Standard' as const,
    })),
  ),
];

export const DEV_RESIDENT_SEEDS: DevResidentSeedRecord[] = [
  {
    id: CORE_SEED_IDS.devResidents.alpha,
    userId: CORE_SEED_IDS.devResidentUsers.alpha,
    fullName: 'Dev Resident Alpha',
    gender: 'male',
    status: 'active',
    email: 'dev.resident.alpha@example.test',
    phone: '+6280000000001',
    ktpNumber: '0000000000000001',
    emergencyContactName: 'Dev Emergency Alpha',
    emergencyContactPhone: '+6280090000001',
  },
  {
    id: CORE_SEED_IDS.devResidents.bravo,
    userId: CORE_SEED_IDS.devResidentUsers.bravo,
    fullName: 'Dev Resident Bravo',
    gender: 'male',
    status: 'active',
    email: 'dev.resident.bravo@example.test',
    phone: '+6280000000002',
    ktpNumber: '0000000000000002',
    emergencyContactName: 'Dev Emergency Bravo',
    emergencyContactPhone: '+6280090000002',
  },
  {
    id: CORE_SEED_IDS.devResidents.charlie,
    userId: CORE_SEED_IDS.devResidentUsers.charlie,
    fullName: 'Dev Resident Charlie',
    gender: 'female',
    status: 'active',
    email: 'dev.resident.charlie@example.test',
    phone: '+6280000000003',
    ktpNumber: '0000000000000003',
    emergencyContactName: 'Dev Emergency Charlie',
    emergencyContactPhone: '+6280090000003',
  },
  {
    id: CORE_SEED_IDS.devResidents.delta,
    userId: CORE_SEED_IDS.devResidentUsers.delta,
    fullName: 'Dev Resident Delta',
    gender: 'female',
    status: 'active',
    email: 'dev.resident.delta@example.test',
    phone: '+6280000000004',
    ktpNumber: '0000000000000004',
    emergencyContactName: 'Dev Emergency Delta',
    emergencyContactPhone: '+6280090000004',
  },
  {
    id: CORE_SEED_IDS.devResidents.echo,
    userId: CORE_SEED_IDS.devResidentUsers.echo,
    fullName: 'Dev Resident Echo',
    gender: 'male',
    status: 'active',
    email: 'dev.resident.echo@example.test',
    phone: '+6280000000005',
    ktpNumber: '0000000000000005',
    emergencyContactName: 'Dev Emergency Echo',
    emergencyContactPhone: '+6280090000005',
  },
  {
    id: CORE_SEED_IDS.devResidents.foxtrot,
    userId: CORE_SEED_IDS.devResidentUsers.foxtrot,
    fullName: 'Dev Resident Foxtrot',
    gender: 'female',
    status: 'active',
    email: 'dev.resident.foxtrot@example.test',
    phone: '+6280000000006',
    ktpNumber: '0000000000000006',
    emergencyContactName: 'Dev Emergency Foxtrot',
    emergencyContactPhone: '+6280090000006',
  },
  {
    id: CORE_SEED_IDS.devResidents.golf,
    userId: CORE_SEED_IDS.devResidentUsers.golf,
    fullName: 'Dev Resident Golf',
    gender: 'male',
    status: 'active',
    email: 'dev.resident.golf@example.test',
    phone: '+6280000000007',
    ktpNumber: '0000000000000007',
    emergencyContactName: 'Dev Emergency Golf',
    emergencyContactPhone: '+6280090000007',
  },
  {
    id: CORE_SEED_IDS.devResidents.hotel,
    userId: CORE_SEED_IDS.devResidentUsers.hotel,
    fullName: 'Dev Resident Hotel',
    gender: 'female',
    status: 'active',
    email: 'dev.resident.hotel@example.test',
    phone: '+6280000000008',
    ktpNumber: '0000000000000008',
    emergencyContactName: 'Dev Emergency Hotel',
    emergencyContactPhone: '+6280090000008',
  },
  {
    id: CORE_SEED_IDS.devResidents.inactiveOne,
    userId: CORE_SEED_IDS.devResidentUsers.inactiveOne,
    fullName: 'Dev Resident Inactive One',
    gender: 'male',
    status: 'inactive',
    email: 'dev.resident.inactive.one@example.test',
    phone: '+6280000000009',
    ktpNumber: '0000000000000009',
    emergencyContactName: 'Dev Emergency Inactive One',
    emergencyContactPhone: '+6280090000009',
  },
  {
    id: CORE_SEED_IDS.devResidents.inactiveTwo,
    userId: CORE_SEED_IDS.devResidentUsers.inactiveTwo,
    fullName: 'Dev Resident Inactive Two',
    gender: 'female',
    status: 'inactive',
    email: 'dev.resident.inactive.two@example.test',
    phone: '+6280000000010',
    ktpNumber: '0000000000000010',
    emergencyContactName: 'Dev Emergency Inactive Two',
    emergencyContactPhone: '+6280090000010',
  },
];

export const DEV_OCCUPANCY_SEEDS: DevOccupancySeedRecord[] = [
  { id: CORE_SEED_IDS.devOccupancies.alpha, residentId: CORE_SEED_IDS.devResidents.alpha, roomNumber: 'RK-02-01' },
  { id: CORE_SEED_IDS.devOccupancies.bravo, residentId: CORE_SEED_IDS.devResidents.bravo, roomNumber: 'AK-18A-1B' },
  { id: CORE_SEED_IDS.devOccupancies.charlie, residentId: CORE_SEED_IDS.devResidents.charlie, roomNumber: 'RK-01-01' },
  { id: CORE_SEED_IDS.devOccupancies.delta, residentId: CORE_SEED_IDS.devResidents.delta, roomNumber: 'AK-05A-1B' },
  { id: CORE_SEED_IDS.devOccupancies.echo, residentId: CORE_SEED_IDS.devResidents.echo, roomNumber: 'RK-04-02' },
  { id: CORE_SEED_IDS.devOccupancies.foxtrot, residentId: CORE_SEED_IDS.devResidents.foxtrot, roomNumber: 'RK-03-01' },
  { id: CORE_SEED_IDS.devOccupancies.golf, residentId: CORE_SEED_IDS.devResidents.golf, roomNumber: 'RK-06-01' },
  { id: CORE_SEED_IDS.devOccupancies.hotel, residentId: CORE_SEED_IDS.devResidents.hotel, roomNumber: 'RK-08-01' },
];

export const DEV_BILLING_INVOICE_SEEDS: DevBillingInvoiceSeedRecord[] = [
  { id: CORE_SEED_IDS.devBilling.invoices.alpha, occupancyId: CORE_SEED_IDS.devOccupancies.alpha },
  { id: CORE_SEED_IDS.devBilling.invoices.bravo, occupancyId: CORE_SEED_IDS.devOccupancies.bravo },
  { id: CORE_SEED_IDS.devBilling.invoices.charlie, occupancyId: CORE_SEED_IDS.devOccupancies.charlie },
  { id: CORE_SEED_IDS.devBilling.invoices.delta, occupancyId: CORE_SEED_IDS.devOccupancies.delta },
  { id: CORE_SEED_IDS.devBilling.invoices.echo, occupancyId: CORE_SEED_IDS.devOccupancies.echo },
  { id: CORE_SEED_IDS.devBilling.invoices.foxtrot, occupancyId: CORE_SEED_IDS.devOccupancies.foxtrot },
  { id: CORE_SEED_IDS.devBilling.invoices.golf, occupancyId: CORE_SEED_IDS.devOccupancies.golf },
  { id: CORE_SEED_IDS.devBilling.invoices.hotel, occupancyId: CORE_SEED_IDS.devOccupancies.hotel },
];

export const COMPLAINT_CATEGORY_SEEDS: ComplaintCategorySeedRecord[] = [
  {
    id: CORE_SEED_IDS.complaintCategories.ac,
    code: 'ac',
    name: 'AC',
    defaultPriority: 'high',
    description: 'Masalah pendingin ruangan atau kebocoran AC.',
    sortOrder: 1,
  },
  {
    id: CORE_SEED_IDS.complaintCategories.water,
    code: 'water',
    name: 'Air',
    defaultPriority: 'high',
    description: 'Masalah air, keran, pipa, atau kamar mandi.',
    sortOrder: 2,
  },
  {
    id: CORE_SEED_IDS.complaintCategories.electricity,
    code: 'electricity',
    name: 'Listrik',
    defaultPriority: 'urgent',
    description: 'Masalah listrik, stop kontak, lampu, atau MCB.',
    sortOrder: 3,
  },
  {
    id: CORE_SEED_IDS.complaintCategories.internet,
    code: 'internet',
    name: 'Internet',
    defaultPriority: 'medium',
    description: 'Masalah WiFi atau koneksi internet.',
    sortOrder: 4,
  },
  {
    id: CORE_SEED_IDS.complaintCategories.roomFacility,
    code: 'room_facility',
    name: 'Fasilitas Kamar',
    defaultPriority: 'low',
    description: 'Masalah fasilitas kamar seperti kasur, meja, lemari, atau pintu.',
    sortOrder: 5,
  },
  {
    id: CORE_SEED_IDS.complaintCategories.cleanliness,
    code: 'cleanliness',
    name: 'Kebersihan',
    defaultPriority: 'low',
    description: 'Masalah kebersihan kamar atau area bersama.',
    sortOrder: 6,
  },
  {
    id: CORE_SEED_IDS.complaintCategories.security,
    code: 'security',
    name: 'Keamanan',
    defaultPriority: 'urgent',
    description: 'Masalah keamanan properti atau akses.',
    sortOrder: 7,
  },
  {
    id: CORE_SEED_IDS.complaintCategories.commonFacility,
    code: 'common_facility',
    name: 'Fasilitas Umum',
    defaultPriority: 'medium',
    description: 'Masalah fasilitas bersama seperti koridor, lobby, parkir, atau gerbang.',
    sortOrder: 8,
  },
  {
    id: CORE_SEED_IDS.complaintCategories.noise,
    code: 'noise',
    name: 'Kebisingan',
    defaultPriority: 'medium',
    description: 'Keluhan kebisingan atau gangguan kenyamanan.',
    sortOrder: 9,
  },
  {
    id: CORE_SEED_IDS.complaintCategories.other,
    code: 'other',
    name: 'Lainnya',
    defaultPriority: 'low',
    description: 'Keluhan lain yang belum masuk kategori khusus.',
    sortOrder: 10,
  },
];

export const DEV_USER_SEEDS: DevUserSeedRecord[] = [
  {
    id: CORE_SEED_IDS.devUsers.admin,
    email: 'dev.admin@example.test',
    displayName: 'Dev Admin Complaint',
    roleCode: 'admin',
  },
  {
    id: CORE_SEED_IDS.devUsers.propertyOwner,
    email: 'dev.property.owner@example.test',
    displayName: 'Dev Property Owner',
    roleCode: 'property_owner',
  },
  {
    id: CORE_SEED_IDS.devUsers.technicians.budi,
    email: 'dev.technician.budi@example.test',
    displayName: 'Dev Technician Budi',
    roleCode: 'technician',
    phone: '+6280010000001',
  },
  {
    id: CORE_SEED_IDS.devUsers.technicians.anto,
    email: 'dev.technician.anto@example.test',
    displayName: 'Dev Technician Anto',
    roleCode: 'technician',
    phone: '+6280010000002',
  },
  {
    id: CORE_SEED_IDS.devUsers.technicians.rudi,
    email: 'dev.technician.rudi@example.test',
    displayName: 'Dev Technician Rudi',
    roleCode: 'technician',
    phone: '+6280010000003',
  },
];

export const DEV_TECHNICIAN_SEEDS: DevTechnicianSeedRecord[] = [
  {
    id: CORE_SEED_IDS.devTechnicianProfiles.budi,
    userId: CORE_SEED_IDS.devUsers.technicians.budi,
    displayName: 'Dev Technician Budi',
    phone: '+6280010000001',
    skillTags: 'AC,Listrik,Plumbing',
  },
  {
    id: CORE_SEED_IDS.devTechnicianProfiles.anto,
    userId: CORE_SEED_IDS.devUsers.technicians.anto,
    displayName: 'Dev Technician Anto',
    phone: '+6280010000002',
    skillTags: 'Plumbing,Furniture',
  },
  {
    id: CORE_SEED_IDS.devTechnicianProfiles.rudi,
    userId: CORE_SEED_IDS.devUsers.technicians.rudi,
    displayName: 'Dev Technician Rudi',
    phone: '+6280010000003',
    skillTags: 'Internet,Listrik',
  },
];

export const DEV_COMPLAINT_SEEDS: DevComplaintSeedRecord[] = [
  {
    id: CORE_SEED_IDS.devComplaints.acInProgress,
    code: 'TKT-GSH-2026-0001',
    residentId: CORE_SEED_IDS.devResidents.alpha,
    roomNumber: 'RK-02-01',
    categoryCode: 'ac',
    title: 'AC kamar tidak dingin',
    description: 'Dummy complaint: AC kamar terasa kurang dingin sejak pagi.',
    priority: 'high',
    status: 'in_progress',
    assignedTechnicianKey: 'budi',
  },
  {
    id: CORE_SEED_IDS.devComplaints.waterResolved,
    code: 'TKT-GSH-2026-0002',
    residentId: CORE_SEED_IDS.devResidents.bravo,
    roomNumber: 'AK-18A-1B',
    categoryCode: 'water',
    title: 'Keran kamar mandi bocor',
    description: 'Dummy complaint: Keran kamar mandi menetes terus.',
    priority: 'high',
    status: 'resolved',
    assignedTechnicianKey: 'anto',
  },
  {
    id: CORE_SEED_IDS.devComplaints.internetSubmitted,
    code: 'TKT-GSH-2026-0003',
    residentId: CORE_SEED_IDS.devResidents.charlie,
    roomNumber: 'RK-01-01',
    categoryCode: 'internet',
    title: 'WiFi kamar lambat',
    description: 'Dummy complaint: Koneksi WiFi lambat untuk testing.',
    priority: 'medium',
    status: 'submitted',
  },
  {
    id: CORE_SEED_IDS.devComplaints.corridorAcknowledged,
    code: 'TKT-GSH-2026-0004',
    residentId: CORE_SEED_IDS.devResidents.delta,
    categoryCode: 'common_facility',
    title: 'Lampu koridor mati',
    description: 'Dummy complaint: Lampu koridor area tengah mati.',
    priority: 'medium',
    status: 'acknowledged',
    locationNote: 'Koridor tengah lantai 1',
  },
  {
    id: CORE_SEED_IDS.devComplaints.gateOnHold,
    code: 'TKT-GSH-2026-0005',
    residentId: CORE_SEED_IDS.devResidents.echo,
    categoryCode: 'security',
    title: 'Pintu gerbang sulit ditutup',
    description: 'Dummy complaint: Pintu gerbang perlu pengecekan teknisi.',
    priority: 'urgent',
    status: 'on_hold',
    assignedTechnicianKey: 'budi',
    locationNote: 'Gerbang depan',
  },
  {
    id: CORE_SEED_IDS.devComplaints.wallClosed,
    code: 'TKT-GSH-2026-0006',
    residentId: CORE_SEED_IDS.devResidents.foxtrot,
    roomNumber: 'RK-03-01',
    categoryCode: 'room_facility',
    title: 'Cat dinding mengelupas',
    description: 'Dummy complaint: Cat dinding mengelupas kecil.',
    priority: 'low',
    status: 'closed',
    assignedTechnicianKey: 'anto',
  },
  {
    id: CORE_SEED_IDS.devComplaints.parkingCancelled,
    code: 'TKT-GSH-2026-0007',
    residentId: CORE_SEED_IDS.devResidents.golf,
    categoryCode: 'cleanliness',
    title: 'Sampah area parkir',
    description: 'Dummy complaint: Tiket dibatalkan karena sudah ditangani.',
    priority: 'low',
    status: 'cancelled',
    locationNote: 'Area parkir belakang',
  },
  {
    id: CORE_SEED_IDS.devComplaints.acLeakInProgress,
    code: 'TKT-GSH-2026-0008',
    residentId: CORE_SEED_IDS.devResidents.hotel,
    roomNumber: 'RK-08-01',
    categoryCode: 'ac',
    title: 'AC bocor air',
    description: 'Dummy complaint: AC meneteskan air di dekat meja.',
    priority: 'high',
    status: 'in_progress',
    assignedTechnicianKey: 'budi',
  },
  {
    id: CORE_SEED_IDS.devComplaints.noiseSubmitted,
    code: 'TKT-GSH-2026-0009',
    residentId: CORE_SEED_IDS.devResidents.alpha,
    categoryCode: 'noise',
    title: 'Suara berisik area luar',
    description: 'Dummy complaint: Ada suara berisik untuk skenario submitted.',
    priority: 'medium',
    status: 'submitted',
    locationNote: 'Area luar dekat parkir',
  },
  {
    id: CORE_SEED_IDS.devComplaints.electricityResolved,
    code: 'TKT-GSH-2026-0010',
    residentId: CORE_SEED_IDS.devResidents.charlie,
    roomNumber: 'RK-01-01',
    categoryCode: 'electricity',
    title: 'Stop kontak tidak menyala',
    description: 'Dummy complaint: Stop kontak sudah selesai dicek teknisi.',
    priority: 'urgent',
    status: 'resolved',
    assignedTechnicianKey: 'rudi',
  },
];

export const DEV_WORK_ORDER_SEEDS: DevWorkOrderSeedRecord[] = [
  {
    id: CORE_SEED_IDS.devWorkOrders.acService,
    code: 'WO-GSH-2026-0001',
    complaintId: CORE_SEED_IDS.devComplaints.acInProgress,
    roomNumber: 'RK-02-01',
    title: 'Service AC kamar RK-02-01',
    description: 'Dummy work order untuk service AC.',
    priority: 'high',
    status: 'in_progress',
    assignedTechnicianKey: 'budi',
  },
  {
    id: CORE_SEED_IDS.devWorkOrders.waterRepair,
    code: 'WO-GSH-2026-0002',
    complaintId: CORE_SEED_IDS.devComplaints.waterResolved,
    roomNumber: 'AK-18A-1B',
    title: 'Perbaikan keran kamar mandi',
    description: 'Dummy work order untuk keran bocor.',
    priority: 'high',
    status: 'verified',
    assignedTechnicianKey: 'anto',
  },
  {
    id: CORE_SEED_IDS.devWorkOrders.gateRepair,
    code: 'WO-GSH-2026-0003',
    complaintId: CORE_SEED_IDS.devComplaints.gateOnHold,
    title: 'Pengecekan pintu gerbang',
    description: 'Dummy work order common area gerbang depan.',
    priority: 'urgent',
    status: 'on_hold',
    assignedTechnicianKey: 'budi',
  },
  {
    id: CORE_SEED_IDS.devWorkOrders.acLeak,
    code: 'WO-GSH-2026-0004',
    complaintId: CORE_SEED_IDS.devComplaints.acLeakInProgress,
    roomNumber: 'RK-08-01',
    title: 'Perbaikan AC bocor',
    description: 'Dummy work order AC bocor.',
    priority: 'high',
    status: 'assigned',
    assignedTechnicianKey: 'budi',
  },
  {
    id: CORE_SEED_IDS.devWorkOrders.electricityCheck,
    code: 'WO-GSH-2026-0005',
    complaintId: CORE_SEED_IDS.devComplaints.electricityResolved,
    roomNumber: 'RK-01-01',
    title: 'Cek stop kontak kamar',
    description: 'Dummy work order listrik.',
    priority: 'urgent',
    status: 'completed',
    assignedTechnicianKey: 'rudi',
  },
  {
    id: CORE_SEED_IDS.devWorkOrders.lobbyLamp,
    code: 'WO-GSH-2026-0006',
    title: 'Ganti lampu lobby',
    description: 'Dummy standalone work order fasilitas umum.',
    priority: 'medium',
    status: 'open',
  },
  {
    id: CORE_SEED_IDS.devWorkOrders.pumpInspection,
    code: 'WO-GSH-2026-0007',
    title: 'Inspeksi pompa air',
    description: 'Dummy standalone work order pompa air.',
    priority: 'medium',
    status: 'assigned',
    assignedTechnicianKey: 'anto',
  },
];

export const DEV_VEHICLE_SEEDS: DevVehicleSeedRecord[] = [
  {
    id: CORE_SEED_IDS.devVehicles.alphaMotor,
    code: 'VEH-GSH-2026-0001',
    residentId: CORE_SEED_IDS.devResidents.alpha,
    roomNumber: 'RK-02-01',
    plateNumber: 'D 1001 DEV',
    vehicleType: 'motorcycle',
    brand: 'Honda Vario',
    color: 'Black',
    year: '2022',
    status: 'active',
  },
  {
    id: CORE_SEED_IDS.devVehicles.alphaCar,
    code: 'VEH-GSH-2026-0002',
    residentId: CORE_SEED_IDS.devResidents.alpha,
    roomNumber: 'RK-02-01',
    plateNumber: 'D 1002 DEV',
    vehicleType: 'car',
    brand: 'Toyota Avanza',
    color: 'Silver',
    year: '2021',
    status: 'active',
  },
  {
    id: CORE_SEED_IDS.devVehicles.bravoMotor,
    code: 'VEH-GSH-2026-0003',
    residentId: CORE_SEED_IDS.devResidents.bravo,
    roomNumber: 'AK-18A-1B',
    plateNumber: 'D 1003 DEV',
    vehicleType: 'motorcycle',
    brand: 'Yamaha NMAX',
    color: 'Blue',
    year: '2023',
    status: 'active',
  },
  {
    id: CORE_SEED_IDS.devVehicles.charlieMotor,
    code: 'VEH-GSH-2026-0004',
    residentId: CORE_SEED_IDS.devResidents.charlie,
    roomNumber: 'RK-01-01',
    plateNumber: 'D 1004 DEV',
    vehicleType: 'motorcycle',
    brand: 'Honda Beat',
    color: 'White',
    year: '2020',
    status: 'pending_approval',
  },
  {
    id: CORE_SEED_IDS.devVehicles.deltaCar,
    code: 'VEH-GSH-2026-0005',
    residentId: CORE_SEED_IDS.devResidents.delta,
    roomNumber: 'AK-05A-1B',
    plateNumber: 'D 1005 DEV',
    vehicleType: 'car',
    brand: 'Daihatsu Ayla',
    color: 'Red',
    year: '2022',
    status: 'pending_approval',
  },
  {
    id: CORE_SEED_IDS.devVehicles.echoMotor,
    code: 'VEH-GSH-2026-0006',
    residentId: CORE_SEED_IDS.devResidents.echo,
    roomNumber: 'RK-04-02',
    plateNumber: 'D 1006 DEV',
    vehicleType: 'motorcycle',
    brand: 'Suzuki Address',
    color: 'Grey',
    year: '2019',
    status: 'suspended',
  },
  {
    id: CORE_SEED_IDS.devVehicles.foxtrotMotor,
    code: 'VEH-GSH-2026-0007',
    residentId: CORE_SEED_IDS.devResidents.foxtrot,
    roomNumber: 'RK-03-01',
    plateNumber: 'D 1007 DEV',
    vehicleType: 'motorcycle',
    brand: 'Honda Scoopy',
    color: 'Cream',
    year: '2023',
    status: 'active',
  },
  {
    id: CORE_SEED_IDS.devVehicles.golfCar,
    code: 'VEH-GSH-2026-0008',
    residentId: CORE_SEED_IDS.devResidents.golf,
    roomNumber: 'RK-06-01',
    plateNumber: 'D 1008 DEV',
    vehicleType: 'car',
    brand: 'Honda Brio',
    color: 'Yellow',
    year: '2020',
    status: 'suspended',
  },
  {
    id: CORE_SEED_IDS.devVehicles.hotelMotor,
    code: 'VEH-GSH-2026-0009',
    residentId: CORE_SEED_IDS.devResidents.hotel,
    roomNumber: 'RK-08-01',
    plateNumber: 'D 1009 DEV',
    vehicleType: 'motorcycle',
    brand: 'Yamaha Fazzio',
    color: 'Green',
    year: '2024',
    status: 'active',
  },
];

export const DEV_PARKING_ZONE_SEEDS: DevParkingZoneSeedRecord[] = [
  {
    id: CORE_SEED_IDS.devParkingZones.motorcycleFront,
    zoneCode: 'MTR-FRONT',
    zoneName: 'Motorcycle Front Yard',
    zoneType: 'motorcycle',
    capacity: 12,
    locationDescription: 'Development dummy motorcycle zone near front gate.',
    sortOrder: 1,
  },
  {
    id: CORE_SEED_IDS.devParkingZones.motorcycleBack,
    zoneCode: 'MTR-BACK',
    zoneName: 'Motorcycle Back Yard',
    zoneType: 'motorcycle',
    capacity: 8,
    locationDescription: 'Development dummy motorcycle zone near service area.',
    sortOrder: 2,
  },
  {
    id: CORE_SEED_IDS.devParkingZones.carMain,
    zoneCode: 'CAR-MAIN',
    zoneName: 'Car Main Parking',
    zoneType: 'car',
    capacity: 4,
    locationDescription: 'Development dummy car parking zone.',
    sortOrder: 3,
  },
];

export const DEV_PARKING_SLOT_SEEDS: DevParkingSlotSeedRecord[] = [
  {
    id: CORE_SEED_IDS.devParkingSlots.motorcycleFront01,
    zoneKey: 'motorcycleFront',
    slotNumber: 'MF-01',
    slotType: 'motorcycle',
    vehicleId: CORE_SEED_IDS.devVehicles.alphaMotor,
  },
  {
    id: CORE_SEED_IDS.devParkingSlots.motorcycleFront02,
    zoneKey: 'motorcycleFront',
    slotNumber: 'MF-02',
    slotType: 'motorcycle',
    vehicleId: CORE_SEED_IDS.devVehicles.bravoMotor,
  },
  {
    id: CORE_SEED_IDS.devParkingSlots.motorcycleFront03,
    zoneKey: 'motorcycleFront',
    slotNumber: 'MF-03',
    slotType: 'motorcycle',
  },
  {
    id: CORE_SEED_IDS.devParkingSlots.motorcycleBack01,
    zoneKey: 'motorcycleBack',
    slotNumber: 'MB-01',
    slotType: 'motorcycle',
    vehicleId: CORE_SEED_IDS.devVehicles.foxtrotMotor,
  },
  {
    id: CORE_SEED_IDS.devParkingSlots.carMain01,
    zoneKey: 'carMain',
    slotNumber: 'CM-01',
    slotType: 'car',
    vehicleId: CORE_SEED_IDS.devVehicles.alphaCar,
  },
  {
    id: CORE_SEED_IDS.devParkingSlots.carMain02,
    zoneKey: 'carMain',
    slotNumber: 'CM-02',
    slotType: 'car',
  },
];

export function ownerIdentityFor(environment: SeedEnvironment): { email: string; displayName: string } {
  if (environment === 'production') {
    return { email: process.env.SEED_OWNER_EMAIL ?? 'owner@granada.id', displayName: 'System Owner' };
  }

  return { email: process.env.SEED_OWNER_EMAIL ?? 'owner@granada.dev', displayName: 'Dev Owner' };
}
