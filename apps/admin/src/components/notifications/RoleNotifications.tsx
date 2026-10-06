import { NotificationBell, NotificationInboxPage, type DateFieldProps } from "@granada-kost/ui";
import { EmptyState } from "@/components/state/EmptyState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { LoadingState } from "@/components/state/LoadingState";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { canReadNotificationCenter } from "@/lib/admin-ux-notification-center";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth/useAuth";
import { useProperty } from "@/lib/property/useProperty";

function NotificationDateField({ id, label, value, onChange }: DateFieldProps) {
  return (
    <HeroUiDatePicker
      id={id}
      label={label}
      value={value}
      onChange={(nextValue) => onChange(nextValue ?? "")}
      ariaLabel={label}
    />
  );
}

function NotificationMonthField({ label, value, onChange }: DateFieldProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium leading-none">{label}</span>
      <MonthYearPicker
        value={value}
        onChange={onChange}
        label={label}
        title={label}
        description="Pilih bulan dan tahun untuk memfilter notifikasi Owner."
        yearLabel="Tahun laporan"
      />
    </div>
  );
}

export function AdminNotificationBell() {
  const { user, status } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasAccess = canReadNotificationCenter({
    roles: user?.roles,
    permissions: user?.permissions,
  });

  if (status !== "authenticated" || !user || !currentPropertyId || !hasAccess) return null;

  return (
    <NotificationBell
      key={`${user.id}:${currentPropertyId}`}
      client={apiClient}
      accountKey={user.id}
      role="admin"
      propertyId={currentPropertyId}
      allHref="/notifications"
    />
  );
}

export function AdminNotificationInbox() {
  const { user, status } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasAccess = canReadNotificationCenter({
    roles: user?.roles,
    permissions: user?.permissions,
  });

  if (status === "loading") return <LoadingState label="Memuat akun..." />;
  if (!user || !hasAccess) {
    return (
      <ForbiddenState description="Akun Anda tidak memiliki izin untuk melihat notifikasi properti ini." />
    );
  }
  if (!currentPropertyId) {
    return (
      <EmptyState
        title="Pilih properti terlebih dahulu"
        description="Pilih properti melalui menu untuk membaca notifikasi akun Anda dalam properti tersebut."
      />
    );
  }

  return (
    <NotificationInboxPage
      key={`${user.id}:${currentPropertyId}`}
      client={apiClient}
      accountKey={user.id}
      role="admin"
      propertyId={currentPropertyId}
      renderDateField={(props) => <NotificationDateField {...props} />}
    />
  );
}

export function OwnerNotificationBell() {
  const { user, status, hasRole } = useAuth();

  if (status !== "authenticated" || !user || !hasRole("property_owner")) return null;

  return (
    <NotificationBell
      key={user.id}
      client={apiClient}
      accountKey={user.id}
      role="owner"
      allHref="/property-owners/portal/notifications"
    />
  );
}

export function OwnerNotificationInbox() {
  const { user, status, hasRole } = useAuth();

  if (status === "loading") return <LoadingState label="Memuat akun..." />;
  if (!user || !hasRole("property_owner")) {
    return <ForbiddenState description="Halaman ini tersedia untuk akun Property Owner." />;
  }

  return (
    <NotificationInboxPage
      key={user.id}
      client={apiClient}
      accountKey={user.id}
      role="owner"
      renderDateField={(props) => <NotificationDateField {...props} />}
      renderMonthField={(props) => <NotificationMonthField {...props} />}
    />
  );
}
