export type OwnerPortalRouteId =
  | "dashboard"
  | "assets"
  | "occupancy"
  | "finance"
  | "issues"
  | "reports"
  | "notifications"
  | "account";

export type OwnerPortalRouteMetadata = {
  id: OwnerPortalRouteId;
  label: string;
  shortLabel: string;
  to: string;
  description: string;
  historicalAllowed: boolean;
  mobilePriority?: number;
};

export const ownerPortalRouteRegistry: readonly OwnerPortalRouteMetadata[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    shortLabel: "Dashboard",
    to: "/property-owners/portal",
    description: "Ringkasan aset dan perhatian utama",
    historicalAllowed: false,
    mobilePriority: 1,
  },
  {
    id: "assets",
    label: "Aset Saya",
    shortLabel: "Aset",
    to: "/property-owners/portal/assets",
    description: "Bangunan dan kamar dalam cakupan kepemilikan",
    historicalAllowed: false,
    mobilePriority: 2,
  },
  {
    id: "occupancy",
    label: "Hunian & Penyewaan",
    shortLabel: "Hunian",
    to: "/property-owners/portal/occupancy",
    description: "Ringkasan hunian dan masa sewa yang aman",
    historicalAllowed: false,
    mobilePriority: 3,
  },
  {
    id: "finance",
    label: "Pembayaran & Pendapatan",
    shortLabel: "Keuangan",
    to: "/property-owners/portal/finance",
    description: "Pendapatan, settlement, dan payout per periode",
    historicalAllowed: true,
    mobilePriority: 4,
  },
  {
    id: "issues",
    label: "Komplain & Maintenance",
    shortLabel: "Komplain",
    to: "/property-owners/portal/issues",
    description: "Masalah operasional pada aset dalam cakupan",
    historicalAllowed: true,
  },
  {
    id: "reports",
    label: "Laporan",
    shortLabel: "Laporan",
    to: "/property-owners/portal/reports",
    description: "Pratinjau dan ekspor laporan periodik",
    historicalAllowed: true,
  },
  {
    id: "notifications",
    label: "Notifikasi",
    shortLabel: "Notifikasi",
    to: "/property-owners/portal/notifications",
    description: "Pemberitahuan aman terkait aset dan periode",
    historicalAllowed: true,
  },
  {
    id: "account",
    label: "Profil Akun",
    shortLabel: "Profil",
    to: "/property-owners/portal/account",
    description: "Identitas akun dan batas akses hanya baca",
    historicalAllowed: true,
  },
] as const;

export function getOwnerPortalRoute(id: OwnerPortalRouteId): OwnerPortalRouteMetadata | undefined {
  return ownerPortalRouteRegistry.find((route) => route.id === id);
}

export function getVisibleOwnerPortalRoutes(
  historical: boolean,
): readonly OwnerPortalRouteMetadata[] {
  return historical
    ? ownerPortalRouteRegistry.filter((route) => route.historicalAllowed)
    : ownerPortalRouteRegistry;
}

export function isOwnerPortalRouteActive(
  route: OwnerPortalRouteMetadata,
  pathname: string,
): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (route.id === "dashboard") return normalized === route.to;
  return normalized === route.to || normalized.startsWith(`${route.to}/`);
}
