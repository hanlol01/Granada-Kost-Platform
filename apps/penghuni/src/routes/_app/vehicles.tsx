import { createFileRoute } from "@tanstack/react-router";
import { Car, CheckCircle2, Clock3, Plus, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import {
  useCreateMyVehicle,
  useMyVehicles,
  type ResidentVehicleType,
} from "@/hooks/usePenghuniVehicles";

export const Route = createFileRoute("/_app/vehicles")({ component: VehiclesPage });

const typeLabels: Record<ResidentVehicleType, string> = {
  motorcycle: "Sepeda motor",
  car: "Mobil",
  bicycle: "Sepeda",
  electric_scooter: "Skuter listrik",
  other: "Lainnya",
};

function VehiclesPage() {
  const vehicles = useMyVehicles();
  const [open, setOpen] = useState(false);
  const create = useCreateMyVehicle();

  return (
    <>
      <AppHeader
        title="Kendaraan & Parkir"
        subtitle="Data kendaraan yang terhubung dengan akun Anda"
        action={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
          >
            <Plus className="h-4 w-4" />
            Tambah
          </button>
        }
      />
      <main className="flex flex-col gap-4 px-5 py-5 animate-[fade-in_0.3s_ease-out]">
        <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Kelola data kendaraan Anda</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Pendaftaran hanya untuk kendaraan milik Anda. Persetujuan dan slot parkir tetap
                ditentukan pengelola.
              </p>
            </div>
          </div>
        </section>
        {vehicles.isLoading ? (
          <LoadingState label="Memuat kendaraan..." />
        ) : vehicles.isError ? (
          <ErrorState error={vehicles.error} onRetry={() => void vehicles.refetch()} />
        ) : (vehicles.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-border/80 bg-card p-4">
            <EmptyState
              title="Belum ada kendaraan"
              description="Tambahkan kendaraan agar pengelola dapat menghubungkannya dengan parkir Anda."
              icon={<Car className="h-5 w-5" />}
            />
          </div>
        ) : (
          <div className="grid gap-3">
            {vehicles.data!.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        )}
      </main>
      {open ? (
        <VehicleForm
          onClose={() => setOpen(false)}
          pending={create.isPending}
          onSubmit={(input) => create.mutate(input, { onSuccess: () => setOpen(false) })}
        />
      ) : null}
    </>
  );
}

function VehicleCard({
  vehicle,
}: {
  vehicle: NonNullable<ReturnType<typeof useMyVehicles>["data"]>[number];
}) {
  const pending = vehicle.vehicleStatus === "pending_approval";
  return (
    <article className="rounded-2xl border border-border/80 bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
          <Car className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{vehicle.plateNumber}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {typeLabels[vehicle.vehicleType]} · {vehicle.brand} · {vehicle.color}
              </p>
            </div>
            <span
              className={
                (pending
                  ? "bg-warning/15 text-warning-foreground"
                  : vehicle.vehicleStatus === "active"
                    ? "bg-success/15 text-success"
                    : "bg-secondary text-muted-foreground") +
                " inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
              }
            >
              {pending ? <Clock3 className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {pending
                ? "Menunggu persetujuan"
                : vehicle.vehicleStatus === "active"
                  ? "Aktif"
                  : "Tidak aktif"}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Kode {vehicle.vehicleCode}
            {vehicle.snapshotRoomNumber ? ` · Kamar ${vehicle.snapshotRoomNumber}` : ""}
          </p>
        </div>
      </div>
    </article>
  );
}

function VehicleForm({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (input: {
    plate_number: string;
    vehicle_type: ResidentVehicleType;
    brand: string;
    color: string;
    year?: string;
    notes?: string;
  }) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    plate_number: "",
    vehicle_type: "motorcycle" as ResidentVehicleType,
    brand: "",
    color: "",
    year: "",
    notes: "",
  });
  const valid = form.plate_number.trim() && form.brand.trim() && form.color.trim();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-3 sm:items-center">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid)
            onSubmit({ ...form, year: form.year || undefined, notes: form.notes || undefined });
        }}
        className="w-full max-w-lg rounded-3xl border border-border bg-background p-5 shadow-[var(--shadow-glow)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Tambah kendaraan</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Data dikirim ke pengelola untuk ditinjau.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary"
          >
            Tutup
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium">
            Nomor polisi
            <input
              required
              value={form.plate_number}
              onChange={(e) => setForm({ ...form, plate_number: e.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
              placeholder="B 1234 ABC"
            />
          </label>
          <label className="text-xs font-medium">
            Jenis
            <select
              value={form.vehicle_type}
              onChange={(e) =>
                setForm({ ...form, vehicle_type: e.target.value as ResidentVehicleType })
              }
              className="mt-1 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
            >
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Merek
            <input
              required
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
            />
          </label>
          <label className="text-xs font-medium">
            Warna
            <input
              required
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block text-xs font-medium">
          Catatan (opsional)
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="mt-1 min-h-20 w-full rounded-xl border border-border bg-card p-3 text-sm"
          />
        </label>
        <button
          disabled={!valid || pending}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Mengirim..." : "Daftarkan kendaraan"}
        </button>
      </form>
    </div>
  );
}
