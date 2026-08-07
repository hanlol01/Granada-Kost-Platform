import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BedDouble,
  Bell,
  Bike,
  Building2,
  CalendarCheck,
  Cctv,
  ClipboardList,
  CreditCard,
  History,
  Images,
  Inbox,
  LayoutDashboard,
  Lock,
  MessageSquareWarning,
  Settings,
  Users,
} from "lucide-react";
import type { RoleCode } from "@granada-kost/domain";
import { isAdminFeatureEnabled, type AdminFeatureFlag } from "@/lib/features";

export type AdminNavSection = "master-data" | "pengelolaan" | "operasional-terbatas" | "lainnya";

export type AdminRouteId =
  | "dashboard"
  | "rooms"
  | "rooms-summary"
  | "room-detail"
  | "rooms-rumah-kost"
  | "rooms-apart-kost"
  | "rooms-fasilitas"
  | "rooms-galeri"
  | "terms"
  | "leases"
  | "leases-create"
  | "lease-detail"
  | "tenants"
  | "payments"
  | "vehicles"
  | "parking-legacy"
  | "booking-leads"
  | "booking"
  | "bookings"
  | "complaints"
  | "reports"
  | "notifications"
  | "settings"
  | "smart-lock"
  | "access-history"
  | "cctv"
  | "hunian-gallery-legacy";

export type RouteAccess = {
  /** At least one role is required when supplied. */
  roles?: readonly RoleCode[];
  /** Every read capability is required; backend remains the authority. */
  readCapabilities?: readonly string[];
  /** At least one capability is required when supplied. */
  anyReadCapabilities?: readonly string[];
  /** Metadata for controls; it never grants route access by itself. */
  mutationCapabilities?: readonly string[];
  feature?: AdminFeatureFlag;
};

export type AdminRouteMetadata = {
  id: AdminRouteId;
  /** Undefined marks a virtual group used by navigation and breadcrumbs. */
  to?: string;
  /** Canonical search state shared by desktop and mobile navigation. */
  search?: Readonly<Record<string, string>>;
  label: string;
  parentId?: AdminRouteId;
  section: AdminNavSection;
  order: number;
  icon: LucideIcon;
  access: RouteAccess;
  /** A group is not a leaf route, even if its link is the summary route. */
  group?: boolean;
  /** Keep compatibility URLs out of navigation while still testing/guarding them. */
  redirectOnly?: boolean;
  navigation?: {
    sidebar?: boolean;
    mobilePriority?: number;
  };
  /** Dynamic records use a safe generic label, never a raw identifier. */
  safeLabel?: (params: Readonly<Record<string, string | undefined>>) => string;
};

const ROOM_READ: RouteAccess = {
  roles: ["owner", "manager", "admin", "property_owner"],
  readCapabilities: ["room.read"],
};

const ROOM_MASTER_READ: RouteAccess = {
  ...ROOM_READ,
  feature: "adminUxMaster",
};

const ROOM_MANAGE: RouteAccess = {
  ...ROOM_READ,
  mutationCapabilities: ["room.manage"],
  feature: "adminUxMaster",
};

const OWNER_MANAGER_ADMIN: readonly RoleCode[] = ["owner", "manager", "admin"];

/**
 * Single registry for all user-visible route metadata. Do not add labels,
 * feature predicates, or capability checks to a second nav/breadcrumb list.
 */
export const adminRouteRegistry: readonly AdminRouteMetadata[] = [
  {
    id: "dashboard",
    to: "/",
    label: "Dashboard",
    section: "master-data",
    order: 10,
    icon: LayoutDashboard,
    access: {
      roles: OWNER_MANAGER_ADMIN,
      readCapabilities: ["room.read", "lease.read", "billing.read"],
    },
    navigation: { sidebar: true, mobilePriority: 10 },
  },
  {
    id: "rooms",
    to: "/rooms",
    label: "Kamar",
    section: "master-data",
    order: 20,
    icon: BedDouble,
    access: ROOM_MASTER_READ,
    group: true,
    navigation: { sidebar: true, mobilePriority: 20 },
  },
  {
    id: "rooms-summary",
    to: "/rooms",
    label: "Ringkasan",
    parentId: "rooms",
    section: "master-data",
    order: 21,
    icon: BedDouble,
    access: ROOM_MASTER_READ,
    navigation: { sidebar: true },
  },
  {
    id: "room-detail",
    to: "/rooms/$roomNumber",
    label: "Detail Kamar",
    parentId: "rooms-summary",
    section: "master-data",
    order: 21.5,
    icon: BedDouble,
    access: {
      roles: OWNER_MANAGER_ADMIN,
      readCapabilities: ["room.read"],
      mutationCapabilities: ["room.manage"],
      feature: "adminUxMaster",
    },
    safeLabel: () => "Detail Kamar",
  },
  {
    id: "rooms-rumah-kost",
    to: "/rooms/rumah-kost",
    label: "Rumah Kost",
    parentId: "rooms",
    section: "master-data",
    order: 22,
    icon: Building2,
    access: ROOM_MANAGE,
    navigation: { sidebar: true },
  },
  {
    id: "rooms-apart-kost",
    to: "/rooms/apart-kost",
    label: "Apart Kost",
    parentId: "rooms",
    section: "master-data",
    order: 23,
    icon: Building2,
    access: ROOM_MANAGE,
    navigation: { sidebar: true },
  },
  {
    id: "rooms-fasilitas",
    to: "/rooms/fasilitas",
    label: "Fasilitas",
    parentId: "rooms",
    section: "master-data",
    order: 24,
    icon: ClipboardList,
    access: ROOM_MANAGE,
    navigation: { sidebar: true },
  },
  {
    id: "rooms-galeri",
    to: "/rooms/galeri",
    label: "Galeri",
    parentId: "rooms",
    section: "master-data",
    order: 25,
    icon: Images,
    access: ROOM_MANAGE,
    navigation: { sidebar: true },
  },
  {
    id: "terms",
    to: "/syarat-ketentuan",
    label: "Syarat & Ketentuan",
    section: "master-data",
    order: 30,
    icon: ClipboardList,
    access: ROOM_MANAGE,
    navigation: { sidebar: true },
  },
  {
    id: "leases",
    to: "/penyewaan",
    label: "Penyewaan",
    section: "pengelolaan",
    order: 40,
    icon: CalendarCheck,
    access: {
      roles: OWNER_MANAGER_ADMIN,
      readCapabilities: ["lease.read"],
      feature: "adminUxLease",
    },
    // Lease endpoints remain technical authorities, but the resident + lease
    // hub is the only operator-facing navigation entry.
    redirectOnly: true,
    navigation: { sidebar: false },
  },
  {
    id: "leases-create",
    to: "/penyewaan/tambah",
    label: "Tambah Penyewaan",
    parentId: "leases",
    section: "pengelolaan",
    order: 41,
    icon: CalendarCheck,
    access: {
      roles: OWNER_MANAGER_ADMIN,
      readCapabilities: ["lease.read"],
      mutationCapabilities: ["lease.manage"],
      feature: "adminUxLease",
    },
    redirectOnly: true,
  },
  {
    id: "lease-detail",
    to: "/penyewaan/$leaseId",
    label: "Detail Penyewaan",
    parentId: "leases",
    section: "pengelolaan",
    order: 42,
    icon: CalendarCheck,
    access: {
      roles: OWNER_MANAGER_ADMIN,
      readCapabilities: ["lease.read"],
      feature: "adminUxLease",
    },
    safeLabel: () => "Detail Penyewaan",
  },
  {
    id: "tenants",
    to: "/tenants",
    label: "Penghuni",
    section: "pengelolaan",
    order: 50,
    icon: Users,
    access: { roles: OWNER_MANAGER_ADMIN, readCapabilities: ["resident.read"] },
    navigation: { sidebar: true, mobilePriority: 40 },
  },
  {
    id: "payments",
    to: "/payments",
    label: "Pembayaran",
    section: "pengelolaan",
    order: 60,
    icon: CreditCard,
    access: { roles: OWNER_MANAGER_ADMIN, readCapabilities: ["billing.read"] },
    navigation: { sidebar: true, mobilePriority: 50 },
  },
  {
    id: "vehicles",
    to: "/vehicles",
    search: { tab: "vehicles" },
    label: "Kendaraan & Parkir",
    section: "pengelolaan",
    order: 70,
    icon: Bike,
    access: {
      roles: OWNER_MANAGER_ADMIN,
      anyReadCapabilities: ["vehicle.manage", "parking.manage"],
    },
    navigation: { sidebar: true, mobilePriority: 60 },
  },
  {
    id: "parking-legacy",
    to: "/parking",
    label: "Parkir",
    parentId: "vehicles",
    section: "pengelolaan",
    order: 71,
    icon: Bike,
    access: { roles: OWNER_MANAGER_ADMIN, readCapabilities: ["parking.manage"] },
    redirectOnly: true,
  },
  {
    id: "booking-leads",
    to: "/booking-leads",
    label: "Minat Booking",
    section: "pengelolaan",
    order: 45,
    icon: Inbox,
    access: { roles: ["manager", "admin"] },
    navigation: { sidebar: true, mobilePriority: 70 },
  },
  {
    id: "smart-lock",
    to: "/smart-lock",
    label: "Smart Lock",
    section: "operasional-terbatas",
    order: 90,
    icon: Lock,
    access: { roles: ["owner", "manager"], feature: "smartLock" },
    navigation: { sidebar: true },
  },
  {
    id: "access-history",
    to: "/access-history",
    label: "Access History",
    section: "operasional-terbatas",
    order: 100,
    icon: History,
    access: { roles: ["owner", "manager"], feature: "smartLock" },
    navigation: { sidebar: true },
  },
  {
    id: "cctv",
    to: "/cctv",
    label: "CCTV",
    section: "operasional-terbatas",
    order: 110,
    icon: Cctv,
    access: { roles: ["owner", "manager"], feature: "cctv" },
    navigation: { sidebar: true },
  },
  {
    id: "complaints",
    to: "/complaints",
    label: "Komplain",
    section: "lainnya",
    order: 120,
    icon: MessageSquareWarning,
    access: {
      roles: OWNER_MANAGER_ADMIN,
      readCapabilities: ["complaint.manage"],
    },
    navigation: { sidebar: true, mobilePriority: 80 },
  },
  {
    id: "reports",
    to: "/reports",
    label: "Laporan",
    section: "lainnya",
    order: 130,
    icon: BarChart3,
    access: { roles: OWNER_MANAGER_ADMIN },
    navigation: { sidebar: true, mobilePriority: 90 },
  },
  {
    id: "notifications",
    to: "/notifications",
    label: "Notifikasi",
    section: "lainnya",
    order: 140,
    icon: Bell,
    access: {
      roles: OWNER_MANAGER_ADMIN,
      readCapabilities: ["notification.manage"],
    },
    navigation: { sidebar: true, mobilePriority: 100 },
  },
  {
    id: "settings",
    to: "/settings",
    label: "Pengaturan",
    section: "lainnya",
    order: 150,
    icon: Settings,
    access: { roles: ["owner", "manager"], readCapabilities: ["property.manage"] },
    navigation: { sidebar: true, mobilePriority: 110 },
  },
  {
    id: "booking",
    to: "/booking",
    label: "Booking Kamar",
    section: "lainnya",
    order: 160,
    icon: CalendarCheck,
    access: { roles: OWNER_MANAGER_ADMIN, feature: "booking" },
    navigation: { sidebar: false },
  },
  {
    id: "bookings",
    to: "/bookings",
    label: "Manajemen Booking",
    section: "lainnya",
    order: 170,
    icon: ClipboardList,
    access: { roles: OWNER_MANAGER_ADMIN, feature: "booking" },
    navigation: { sidebar: false },
  },
  {
    id: "hunian-gallery-legacy",
    to: "/hunian-gallery",
    label: "Galeri Hunian",
    section: "master-data",
    order: 999,
    icon: Images,
    access: ROOM_MASTER_READ,
    redirectOnly: true,
  },
] as const;

export const navSectionLabels: Readonly<Record<AdminNavSection, string>> = {
  "master-data": "Master Data",
  pengelolaan: "Pengelolaan",
  "operasional-terbatas": "Operasional Terbatas",
  lainnya: "Lainnya",
};

export type RouteAccessContext = {
  roles: readonly RoleCode[];
  permissions: readonly string[];
  isFeatureEnabled?: (flag: AdminFeatureFlag) => boolean;
};

export type RouteAccessDecision = "allowed" | "forbidden" | "feature-disabled";

export function getRouteAccessDecision(
  route: AdminRouteMetadata,
  context: RouteAccessContext,
): RouteAccessDecision {
  const isFeatureEnabled = context.isFeatureEnabled ?? isAdminFeatureEnabled;
  if (route.access.feature && !isFeatureEnabled(route.access.feature)) return "feature-disabled";
  if (
    route.access.roles?.length &&
    !route.access.roles.some((role) => context.roles.includes(role))
  ) {
    return "forbidden";
  }
  if (
    route.access.readCapabilities?.some((capability) => !context.permissions.includes(capability))
  ) {
    return "forbidden";
  }
  if (
    route.access.anyReadCapabilities?.length &&
    !route.access.anyReadCapabilities.some((capability) => context.permissions.includes(capability))
  ) {
    return "forbidden";
  }
  return "allowed";
}

function isDynamicMatch(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathnameParts = pathname.split("/").filter(Boolean);
  return (
    patternParts.length === pathnameParts.length &&
    patternParts.every((part, index) => part.startsWith("$") || part === pathnameParts[index])
  );
}

/** Resolve a leaf first so /rooms selects Ringkasan rather than the virtual group. */
export function findRouteMetadata(pathname: string): AdminRouteMetadata | undefined {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return [...adminRouteRegistry]
    .filter((route) => !route.group && route.to)
    .sort((a, b) => (b.to?.length ?? 0) - (a.to?.length ?? 0))
    .find((route) => route.to === normalized || isDynamicMatch(route.to!, normalized));
}

export function isRouteActive(route: AdminRouteMetadata, pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (!route.to) return false;
  if (route.group) return normalized === route.to || normalized.startsWith(route.to + "/");
  return route.to === normalized || isDynamicMatch(route.to, normalized);
}

export function getVisibleRoutes(context: RouteAccessContext): readonly AdminRouteMetadata[] {
  return adminRouteRegistry
    .filter((route) => !route.redirectOnly && getRouteAccessDecision(route, context) === "allowed")
    .sort((a, b) => a.order - b.order);
}

export function getRouteBreadcrumbs(
  pathname: string,
  context: RouteAccessContext,
): readonly AdminRouteMetadata[] {
  const current = findRouteMetadata(pathname);
  if (!current || getRouteAccessDecision(current, context) !== "allowed") return [];

  const chain: AdminRouteMetadata[] = [current];
  let parentId = current.parentId;
  while (parentId) {
    const parent = adminRouteRegistry.find((route) => route.id === parentId);
    if (!parent) break;
    if (getRouteAccessDecision(parent, context) === "allowed") chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}
