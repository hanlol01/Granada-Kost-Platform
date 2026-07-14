import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Plus,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useM6LeaseAvailableRooms,
  useM6LeaseMutation,
  useM6LeaseResidentOptions,
} from "@/hooks/useAdminUxLeases";
import { adminUxLeaseApi } from "@/lib/admin-ux-lease-api";
import { BILLING_CYCLE_LABEL, jakartaToday } from "@/lib/admin-ux-lease-helpers";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";

type Props = { onCreated: (leaseId: string) => void };

type CreateVariables = {
  roomId: string;
  residentId?: string;
  resident?: { fullName: string };
  startDate: string;
  billingCycle: "monthly" | "yearly";
  notes?: string;
  idempotencyKey: string;
};

export function LeaseCreatePage({ onCreated }: Props) {
  const { currentPropertyId } = useProperty();
  const rooms = useM6LeaseAvailableRooms();
  const residentOptions = useM6LeaseResidentOptions();
  const [step, setStep] = useState(1);
  const [residentMode, setResidentMode] = useState<"existing" | "new">("existing");
  const [residentId, setResidentId] = useState("");
  const [newResidentName, setNewResidentName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [notes, setNotes] = useState("");
  const today = useMemo(() => jakartaToday(), []);
  const intentKey = useRef<string | null>(null);
  const create = useM6LeaseMutation(
    "lease-create",
    "Penyewaan berhasil dibuat",
    (propertyId, input: CreateVariables) =>
      adminUxLeaseApi.leases.create(
        {
          propertyId,
          roomId: input.roomId,
          residentId: input.residentId,
          resident: input.resident,
          startDate: input.startDate,
          billingCycle: input.billingCycle,
          notes: input.notes,
        },
        input.idempotencyKey,
      ),
  );

  const selectedRoom = rooms.data?.items.find((room) => room.id === roomId);
  const selectedResident = residentOptions.data?.items.find(
    (resident) => resident.id === residentId,
  );

  useEffect(() => {
    setResidentId("");
  }, [currentPropertyId]);

  const residentValid =
    residentMode === "existing" ? Boolean(selectedResident) : newResidentName.trim().length >= 2;
  const roomValid = Boolean(selectedRoom);
  const canSubmit = residentValid && roomValid && !create.isPending;

  const resetIntent = () => {
    intentKey.current = null;
  };

  const submit = async () => {
    if (!canSubmit) return;
    const idempotencyKey = intentKey.current ?? newIdempotencyKey();
    intentKey.current = idempotencyKey;
    try {
      const result = await create.mutateAsync({
        roomId,
        residentId: residentMode === "existing" ? residentId : undefined,
        resident: residentMode === "new" ? { fullName: newResidentName.trim() } : undefined,
        startDate: today,
        billingCycle,
        notes: notes.trim() || undefined,
        idempotencyKey,
      });
      intentKey.current = null;
      onCreated(result.lease.id);
    } catch {
      // The mutation boundary shows a safe message and retains the intent key for retry.
    }
  };

  if (rooms.isLoading) {
    return (
      <AppShell title="Tambah Penyewaan" subtitle="Menyiapkan data penghuni dan kamar">
        <LoadingState label="Memuat pilihan lease..." />
      </AppShell>
    );
  }

  if (rooms.error) {
    return (
      <AppShell title="Tambah Penyewaan" subtitle="Buat lease baru untuk kamar kosong">
        <ErrorState
          error={rooms.error}
          title="Gagal memuat data untuk penyewaan"
          onRetry={() => {
            void rooms.refetch();
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Tambah Penyewaan"
      subtitle="Tanggal mulai selalu hari ini menurut Asia/Jakarta"
    >
      <div className="mx-auto max-w-4xl space-y-5 pb-24 lg:pb-8">
        <Stepper step={step} />
        {step === 1 ? (
          <ResidentStep
            mode={residentMode}
            onModeChange={(mode) => {
              setResidentMode(mode);
              resetIntent();
            }}
            residentId={residentId}
            residentOptions={residentOptions.data?.items ?? []}
            residentOptionsLoading={residentOptions.isLoading}
            residentOptionsError={Boolean(residentOptions.error)}
            onResidentChange={setResidentId}
            newResidentName={newResidentName}
            onNewResidentChange={(value) => {
              setNewResidentName(value);
              resetIntent();
            }}
          />
        ) : null}
        {step === 2 ? (
          <RoomStep
            roomId={roomId}
            onRoomChange={(value) => {
              setRoomId(value);
              resetIntent();
            }}
            rooms={rooms.data?.items ?? []}
          />
        ) : null}
        {step === 3 ? (
          <ConfirmStep
            today={today}
            billingCycle={billingCycle}
            onBillingCycleChange={(value) => {
              setBillingCycle(value);
              resetIntent();
            }}
            notes={notes}
            onNotesChange={(value) => {
              setNotes(value);
              resetIntent();
            }}
            residentLabel={
              residentMode === "existing"
                ? (selectedResident?.displayNameMasked ?? "Belum dipilih")
                : newResidentName.trim() || "Penghuni baru"
            }
            room={selectedRoom}
          />
        ) : null}
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={step === 1 || create.isPending}
            onClick={() => setStep((current) => current - 1)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              disabled={(step === 1 && !residentValid) || (step === 2 && !roomValid)}
              onClick={() => setStep((current) => current + 1)}
            >
              Lanjut <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Buat Penyewaan
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Stepper({ step }: { step: number }) {
  const items = ["Penghuni", "Kamar", "Konfirmasi"];
  return (
    <div className="grid grid-cols-3 gap-2" aria-label="Tahap pembuatan penyewaan">
      {items.map((item, index) => {
        const number = index + 1;
        return (
          <div
            key={item}
            className={
              "rounded-lg border p-3 text-center text-sm " +
              (number <= step
                ? "border-blue-500/40 bg-blue-500/10 text-blue-100"
                : "border-slate-800 bg-slate-900 text-slate-500")
            }
          >
            <span className="mr-2 font-semibold">{number}</span>
            {item}
          </div>
        );
      })}
    </div>
  );
}

function ResidentStep({
  mode,
  onModeChange,
  residentId,
  residentOptions,
  residentOptionsLoading,
  residentOptionsError,
  onResidentChange,
  newResidentName,
  onNewResidentChange,
}: {
  mode: "existing" | "new";
  onModeChange: (mode: "existing" | "new") => void;
  residentId: string;
  residentOptions: {
    id: string;
    displayNameMasked: string;
    residentStatus: "active" | "inactive";
  }[];
  residentOptionsLoading: boolean;
  residentOptionsError: boolean;
  onResidentChange: (value: string) => void;
  newResidentName: string;
  onNewResidentChange: (value: string) => void;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <UserRound className="h-5 w-5 text-blue-300" /> Pilih penghuni
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "existing" ? "default" : "outline"}
            onClick={() => onModeChange("existing")}
          >
            Penghuni aktif
          </Button>
          <Button
            type="button"
            variant={mode === "new" ? "default" : "outline"}
            onClick={() => onModeChange("new")}
          >
            <Plus className="mr-2 h-4 w-4" /> Penghuni baru
          </Button>
        </div>
        {mode === "existing" ? (
          <div className="space-y-2">
            <Label htmlFor="existing-resident">Penghuni existing</Label>
            <Select
              value={residentId || "none"}
              onValueChange={(value) => onResidentChange(value === "none" ? "" : value)}
              disabled={residentOptionsLoading || residentOptionsError}
            >
              <SelectTrigger id="existing-resident">
                <SelectValue placeholder="Pilih penghuni" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pilih penghuni</SelectItem>
                {residentOptions.map((resident) => (
                  <SelectItem key={resident.id} value={resident.id}>
                    {resident.displayNameMasked}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {residentOptionsLoading ? (
              <p className="text-xs text-slate-500">Memuat pilihan penghuni...</p>
            ) : residentOptionsError ? (
              <p className="text-xs text-rose-300">Pilihan penghuni tidak dapat dimuat.</p>
            ) : residentOptions.length === 0 ? (
              <p className="text-xs text-slate-500">Tidak ada penghuni untuk properti aktif.</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="new-resident-name">Nama penghuni baru</Label>
            <Input
              id="new-resident-name"
              value={newResidentName}
              maxLength={160}
              onChange={(event) => onNewResidentChange(event.target.value)}
              placeholder="Nama lengkap"
            />
            <p className="text-xs text-slate-500">
              Hanya nama yang diperlukan untuk membuat lease. Data identitas sensitif dikelola
              terpisah.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoomStep({
  roomId,
  onRoomChange,
  rooms,
}: {
  roomId: string;
  onRoomChange: (value: string) => void;
  rooms: {
    id: string;
    number: string;
    kostType: { name: string };
    buildingName?: string | null;
    buildingCode?: string | null;
  }[];
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <CalendarDays className="h-5 w-5 text-blue-300" /> Pilih kamar kosong
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rooms.length ? (
          <div className="space-y-2">
            <Label>Kamar tersedia</Label>
            <Select
              value={roomId || "none"}
              onValueChange={(value) => onRoomChange(value === "none" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kamar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pilih kamar</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.number} · {room.kostType.name}
                    {room.buildingName || room.buildingCode
                      ? ` · ${room.buildingName ?? room.buildingCode}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Server mengunci ulang status kamar saat submit. Jika status berubah, tinjau ulang
              pilihan.
            </p>
          </div>
        ) : (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            title="Tidak ada kamar kosong"
            description="Selesaikan atau transfer lease lain, atau pilih properti yang memiliki inventori tersedia."
          />
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmStep({
  today,
  billingCycle,
  onBillingCycleChange,
  notes,
  onNotesChange,
  residentLabel,
  room,
}: {
  today: string;
  billingCycle: "monthly" | "yearly";
  onBillingCycleChange: (value: "monthly" | "yearly") => void;
  notes: string;
  onNotesChange: (value: string) => void;
  residentLabel: string;
  room?: {
    number: string;
    kostType: { name: string; monthlyPrice: number; yearlyPrice: number; depositAmount: number };
  };
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardHeader>
        <CardTitle className="text-slate-100">Konfirmasi lifecycle</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Tanggal mulai</Label>
            <Input value={today} readOnly aria-readonly="true" />
            <p className="text-xs text-slate-500">
              Terkunci ke hari ini Asia/Jakarta; server memvalidasi kembali.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Siklus tagihan</Label>
            <Select
              value={billingCycle}
              onValueChange={(value) => onBillingCycleChange(value as "monthly" | "yearly")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BILLING_CYCLE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
          <p>
            <span className="text-slate-500">Penghuni:</span> {residentLabel}
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Kamar:</span>{" "}
            {room ? `${room.number} · ${room.kostType.name}` : "Belum dipilih"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Harga dan deposit dipakai dari snapshot server kost type; UI tidak mengirim nilai
            komersial.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lease-notes">Catatan internal (opsional)</Label>
          <Textarea
            id="lease-notes"
            value={notes}
            maxLength={4000}
            rows={3}
            onChange={(event) => onNotesChange(event.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
