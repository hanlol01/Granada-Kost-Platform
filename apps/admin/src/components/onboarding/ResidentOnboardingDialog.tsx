import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { Input } from "@/components/ui/input";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { useM4KostTypes } from "@/hooks/useAdminUxMaster";
import { useResidentOnboarding } from "@/hooks/useResidentOnboarding";
import { useLeaseActivation } from "@/hooks/useLeaseActivation";
import { adminUxMasterApi } from "@/lib/admin-ux-master-api";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { onboardingErrorNotice } from "@/lib/onboarding-error-notice";
import type { BookingLeadRecord } from "@/hooks/useBookingLeads";
import { useProperty } from "@/lib/property";

export function ResidentOnboardingDialog({
  lead,
  manual = false,
  open,
  onOpenChange,
}: {
  lead: BookingLeadRecord | null;
  manual?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { currentPropertyId } = useProperty();
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const mutation = useResidentOnboarding(setTemporaryPassword);
  const activation = useLeaseActivation();
  const [name, setName] = useState(lead?.visitorName ?? "");
  const [start, setStart] = useState(lead?.preferredMoveInDate ?? "");
  const [dp, setDp] = useState("");
  const [deposit, setDeposit] = useState("");
  const [gender, setGender] = useState<"male" | "female">(lead?.gender ?? "female");
  const [roomId, setRoomId] = useState(lead?.roomId ?? "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [activationKey, setActivationKey] = useState(() => newIdempotencyKey());
  const resetOnboarding = mutation.reset;
  const resetActivation = activation.reset;
  const needsRoomSelection = manual || !lead?.roomId;
  const roomFilters = { status: "vacant" as const, limit: 100, offset: 0 };
  const rooms = useQuery({
    queryKey: adminUxQueryKeys.rooms.list(currentPropertyId ?? "", roomFilters),
    queryFn: () => adminUxMasterApi.rooms.list({ propertyId: currentPropertyId!, ...roomFilters }),
    enabled: Boolean(open && needsRoomSelection && currentPropertyId),
    retry: false,
  });
  const kostTypes = useM4KostTypes({ limit: 100 });
  const selectedRoom = rooms.data?.items.find((room) => room.id === roomId);
  const selectedCategory = selectedRoom?.kostType.category ?? lead?.category;
  const commercial = kostTypes.data?.items.find((item) => item.category === selectedCategory);
  const requiredDp = commercial ? Math.ceil(commercial.monthlyPrice * 12 * 0.25) : null;
  const requiredDeposit = commercial ? 0 : null;
  const financialAuthorityReady =
    requiredDp !== null &&
    requiredDeposit !== null &&
    Number(dp) >= requiredDp &&
    Number.isFinite(Number(deposit)) &&
    Number(deposit) >= 0;
  useEffect(() => {
    setName(lead?.visitorName ?? "");
    setStart(lead?.preferredMoveInDate ?? "");
    setGender(lead?.gender ?? "female");
    setRoomId(lead?.roomId ?? "");
    setDp("");
    setDeposit("");
    setPhone("");
    setEmail("");
    setTemporaryPassword(null);
    resetOnboarding();
    resetActivation();
    setActivationKey(newIdempotencyKey());
  }, [lead, open, currentPropertyId, resetActivation, resetOnboarding]);
  useEffect(() => {
    if (!open || requiredDp === null || requiredDeposit === null) return;
    setDp((current) => current || String(requiredDp));
    setDeposit((current) => current || "0");
  }, [open, requiredDeposit, requiredDp]);
  if (!lead && !manual) return null;
  const clearTransientResult = () => {
    setTemporaryPassword(null);
    resetOnboarding();
    resetActivation();
    setActivationKey(newIdempotencyKey());
  };
  const mutationMatchesScope = mutation.variables?.property_id === currentPropertyId;
  const mutationNotice =
    mutation.error && mutationMatchesScope ? onboardingErrorNotice(mutation.error) : null;
  const submit = () => {
    if (!currentPropertyId || !name.trim() || !start || !roomId || !financialAuthorityReady) return;
    setTemporaryPassword(null);
    mutation.mutate({
      property_id: currentPropertyId,
      booking_lead_id: lead?.id,
      room_id: roomId,
      visitor_name: name.trim(),
      visitor_phone: manual && phone.trim() ? phone.trim() : undefined,
      visitor_email: manual && email.trim() ? email.trim() : undefined,
      gender,
      start_date: start,
      term_months: 12,
      billing_cycle: "monthly",
      payment_plan_type: "two_month_installments",
      accepted_terms_version: "KMO-W05-v1",
      dp_verified_amount: Number(dp),
      security_deposit_funded_amount: Number(deposit),
      payment_method: "cash",
    });
  };
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) clearTransientResult();
    onOpenChange(nextOpen);
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{manual ? "Onboarding manual" : "Commit Onboarding"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Ini membuat komitmen onboarding, bukan lease aktif atau occupancy.
        </p>
        <label className="grid gap-1 text-sm">
          Nama calon penghuni
          <Input
            value={name}
            onChange={(event) => {
              clearTransientResult();
              setName(event.target.value);
            }}
          />
        </label>
        <HeroUiDatePicker
          id="legacy-onboarding-start-date"
          label="Tanggal mulai"
          value={start}
          onChange={(value) => {
            clearTransientResult();
            setStart(value ?? "");
          }}
          required
        />
        {manual ? (
          <>
            <label className="grid gap-1 text-sm">
              Jenis kelamin
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={gender}
                onChange={(event) => {
                  clearTransientResult();
                  setGender(event.target.value as "male" | "female");
                }}
              >
                <option value="female">Putri</option>
                <option value="male">Putra</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Nomor telepon login
              <Input
                value={phone}
                onChange={(event) => {
                  clearTransientResult();
                  setPhone(event.target.value);
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Email login (opsional)
              <Input
                type="email"
                value={email}
                onChange={(event) => {
                  clearTransientResult();
                  setEmail(event.target.value);
                }}
              />
            </label>
          </>
        ) : null}
        {needsRoomSelection ? (
          <label className="grid gap-1 text-sm">
            Kamar vacant
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={roomId}
              onChange={(event) => {
                clearTransientResult();
                setRoomId(event.target.value);
              }}
              disabled={rooms.isLoading || rooms.isError}
            >
              <option value="">Pilih kamar authoritative</option>
              {(rooms.data?.items ?? [])
                .filter(
                  (room) =>
                    (manual || room.kostType.category === lead?.category) &&
                    (room.genderPolicy === "mixed" || room.genderPolicy === gender),
                )
                .map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.number} ·{" "}
                    {room.kostType.category === "rukost" ? "Rumah Kost" : "Apart Kost"}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-sm">
          DP tunai dicatat
          <Input
            type="number"
            min="0"
            value={dp}
            onChange={(event) => {
              clearTransientResult();
              setDp(event.target.value);
            }}
          />
          <span className="text-xs text-muted-foreground">
            Minimum 25% nilai kontrak 12 bulan
            {requiredDp === null ? "." : `: ${formatIDR(requiredDp)}.`}
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          Security deposit dicatat
          <Input
            type="number"
            min="0"
            value={deposit}
            onChange={(event) => {
              clearTransientResult();
              setDeposit(event.target.value);
            }}
          />
          <span className="text-xs text-muted-foreground">
            Nilainya bebas mulai Rp0 dan terpisah dari pembayaran sewa.
          </span>
        </label>
        {(dp || deposit) &&
        requiredDp !== null &&
        requiredDeposit !== null &&
        !financialAuthorityReady ? (
          <p role="alert" className="text-sm text-destructive">
            DP belum memenuhi minimum atau security deposit bukan nominal yang valid.
          </p>
        ) : null}
        {mutationNotice ? (
          <NoticeAlert
            tone="destructive"
            title={mutationNotice.title}
            description={mutationNotice.description}
          />
        ) : null}
        <Button
          disabled={
            mutation.isPending ||
            !name.trim() ||
            !start ||
            !roomId ||
            !dp ||
            !financialAuthorityReady ||
            (manual && !phone.trim() && !email.trim())
          }
          onClick={submit}
        >
          {mutation.isPending ? "Menyimpan…" : "Commit Onboarding"}
        </Button>
        {temporaryPassword && mutationMatchesScope ? (
          <div role="status" className="grid gap-2 rounded border p-3 text-sm">
            <p>Kata sandi sementara hanya ditampilkan pada penerbitan pertama ini.</p>
            <code
              aria-label="Kata sandi sementara"
              className="break-all rounded bg-muted p-2 font-mono"
            >
              {temporaryPassword}
            </code>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setTemporaryPassword(null)}
            >
              Saya sudah menyimpan
            </Button>
          </div>
        ) : null}
        {mutationMatchesScope && mutation.data?.leaseStatus === "awaiting_activation" ? (
          <div className="grid gap-2 rounded border p-3">
            <p className="text-sm text-muted-foreground">
              Komitmen onboarding selesai. Aktivasi lease adalah langkah terpisah yang mengaktifkan
              kontrak dan mengikat kamar; occupancy baru dibuat setelah check-in fisik dikonfirmasi.
            </p>
            <Button
              variant="secondary"
              disabled={activation.isPending}
              onClick={() =>
                activation.mutate({
                  leaseId: mutation.data!.leaseId,
                  idempotencyKey: activationKey,
                })
              }
            >
              {activation.isPending ? "Mengaktifkan…" : "Aktifkan Lease"}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
