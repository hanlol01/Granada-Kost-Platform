import { z } from "zod";
import type { LeaseDataCorrectionInput, LeaseRevisionContext } from "./lease-revision-contract.ts";

export type LeaseRevisionDraft = {
  roomId: string;
  roomRecordingErrorConfirmed: boolean;
  evidenceFileIds: string[];
  startDate: string;
  checkedInDate: string;
  termMonths: string;
  commercialMode: "rent" | "owner_sponsored";
  pricingSource: "standard" | "negotiated";
  agreedMonthlyPrice: number;
  pricingAgreementReason: string;
  pricingVarianceAcknowledged: boolean;
  sponsoringOwnerProfileId: string;
  managementFeeMode: "charged" | "waived";
  managementFeePayer: "resident" | "owner" | "other";
  managementFeePayerName: string;
  ownerSponsorshipReason: string;
  paymentPlanType: "" | "annual_full" | "two_month_installments" | "monthly_installments";
  billingCycle: "" | "monthly" | "yearly";
  reason: string;
};
export type LeaseRevisionErrors = Partial<Record<keyof LeaseRevisionDraft | "changes", string>>;

export function createLeaseRevisionDraft(context: LeaseRevisionContext): LeaseRevisionDraft {
  const policy = context.ownerSponsorship;
  return {
    roomId: context.room.id,
    roomRecordingErrorConfirmed: false,
    evidenceFileIds: [],
    startDate: context.lease.checkedInDate ?? context.lease.recordedStartDate,
    checkedInDate: context.lease.checkedInDate ?? "",
    termMonths: String(context.lease.termMonths),
    commercialMode: context.lease.commercialMode,
    pricingSource: context.lease.pricingSource === "negotiated" ? "negotiated" : "standard",
    agreedMonthlyPrice: context.lease.agreedMonthlyPrice,
    pricingAgreementReason: context.lease.pricingAgreementReason ?? "",
    pricingVarianceAcknowledged: false,
    sponsoringOwnerProfileId: policy?.ownerProfileId ?? "",
    managementFeeMode: policy?.managementFeeMode ?? "charged",
    managementFeePayer: policy?.managementFeePayer ?? "resident",
    managementFeePayerName: policy?.managementFeePayerName ?? "",
    ownerSponsorshipReason: policy?.sponsorshipReason ?? "",
    paymentPlanType: "",
    billingCycle: "",
    reason: "",
  };
}

export function leaseRevisionChanges(context: LeaseRevisionContext, draft: LeaseRevisionDraft) {
  const original = createLeaseRevisionDraft(context);
  const room = draft.roomId !== original.roomId;
  const mode = draft.commercialMode !== original.commercialMode;
  const checkIn =
    context.lease.physicalCheckInRecorded && draft.checkedInDate !== original.checkedInDate;
  const period =
    draft.startDate !== original.startDate || draft.termMonths !== original.termMonths || checkIn;
  const pricing =
    draft.commercialMode === "rent" &&
    (draft.pricingSource !== original.pricingSource ||
      (draft.pricingSource === "negotiated" &&
        (draft.agreedMonthlyPrice !== original.agreedMonthlyPrice ||
          draft.pricingAgreementReason.trim() !== original.pricingAgreementReason.trim())));
  const sponsorship =
    draft.commercialMode === "owner_sponsored" &&
    (mode ||
      draft.sponsoringOwnerProfileId !== original.sponsoringOwnerProfileId ||
      draft.managementFeeMode !== original.managementFeeMode ||
      draft.ownerSponsorshipReason.trim() !== original.ownerSponsorshipReason.trim() ||
      (draft.managementFeeMode === "charged" &&
        (draft.managementFeePayer !== original.managementFeePayer ||
          (draft.managementFeePayer === "other" &&
            draft.managementFeePayerName.trim() !== original.managementFeePayerName.trim()))));
  return {
    room,
    mode,
    checkIn,
    period,
    pricing,
    sponsorship,
    any: room || mode || period || pricing || sponsorship,
  };
}

/** Proposals only: dates, tariffs, obligations and fee projections are resolved by the server. */
export function buildLeaseRevisionProposal(
  context: LeaseRevisionContext,
  draft: LeaseRevisionDraft,
): LeaseDataCorrectionInput & { reason: string } {
  const changed = leaseRevisionChanges(context, draft);
  const input: LeaseDataCorrectionInput & { reason: string } = { reason: draft.reason.trim() };
  if (draft.startDate !== (context.lease.checkedInDate ?? context.lease.recordedStartDate))
    input.startDate = draft.startDate;
  if (Number(draft.termMonths) !== context.lease.termMonths)
    input.termMonths = Number(draft.termMonths);
  if (changed.checkIn) input.checkedInDate = draft.checkedInDate;
  if (changed.room) {
    input.roomId = draft.roomId;
    input.roomRecordingErrorConfirmed = draft.roomRecordingErrorConfirmed;
    input.roomCorrectionEvidenceFileIds = [...draft.evidenceFileIds];
  }
  if (changed.mode) {
    input.commercialMode = draft.commercialMode;
    if (draft.commercialMode === "rent") {
      input.paymentPlanType = draft.paymentPlanType || undefined;
      input.billingCycle = draft.billingCycle || undefined;
    }
  }
  if (
    draft.commercialMode === "rent" &&
    (changed.period || changed.room || changed.mode || changed.pricing)
  ) {
    input.pricingSource = draft.pricingSource;
    if (draft.pricingSource === "negotiated") {
      input.agreedMonthlyPrice = draft.agreedMonthlyPrice;
      input.pricingAgreementReason = draft.pricingAgreementReason.trim();
      input.pricingVarianceAcknowledged = draft.pricingVarianceAcknowledged;
    }
  }
  if (changed.sponsorship) {
    input.sponsoringOwnerProfileId = draft.sponsoringOwnerProfileId;
    input.managementFeeMode = draft.managementFeeMode;
    input.ownerSponsorshipReason = draft.ownerSponsorshipReason.trim();
    if (draft.managementFeeMode === "charged") {
      input.managementFeePayer = draft.managementFeePayer;
      if (draft.managementFeePayer === "other")
        input.managementFeePayerName = draft.managementFeePayerName.trim();
    }
  }
  return input;
}

export function validateLeaseRevisionDraft(
  context: LeaseRevisionContext,
  draft: LeaseRevisionDraft,
): LeaseRevisionErrors {
  const errors: LeaseRevisionErrors = {};
  const changed = leaseRevisionChanges(context, draft);
  const isDate = (value: string) => z.string().date().safeParse(value).success;
  const validText = (value: string, maximum: number) =>
    value.trim().length >= 3 && value.trim().length <= maximum;
  if (!context.policies.correction.allowed) errors.changes = context.policies.correction.message!;
  else if (!changed.any)
    errors.changes =
      "Belum ada data yang diubah. Ubah pencatatan yang keliru terlebih dahulu, lalu tinjau koreksi.";
  if (!z.string().uuid().safeParse(draft.roomId).success)
    errors.roomId =
      "Pilih kamar yang benar atau pertahankan kamar semula. Penyewaan tidak boleh tanpa kamar.";
  if (!isDate(draft.startDate))
    errors.startDate = "Isi tanggal rencana mulai atau check-in yang valid.";
  if (
    !/^\d+$/.test(draft.termMonths) ||
    Number(draft.termMonths) < 1 ||
    Number(draft.termMonths) > 120
  )
    errors.termMonths = "Durasi sewa harus berupa bilangan bulat 1–120 bulan.";
  if (context.lease.physicalCheckInRecorded) {
    if (!isDate(draft.checkedInDate))
      errors.checkedInDate =
        "Check-in sudah tercatat. Isi tanggal check-in aktual yang benar; tanggal ini tidak dapat dikosongkan.";
    else if (draft.startDate !== draft.checkedInDate)
      errors.startDate =
        "Periode sewa mengikuti check-in aktual. Perbaiki tanggal check-in bila pencatatan awal keliru.";
  }
  if (changed.room) {
    if (!context.policies.roomCorrection.allowed)
      errors.roomId = context.policies.roomCorrection.message!;
    if (!draft.roomRecordingErrorConfirmed)
      errors.roomRecordingErrorConfirmed =
        "Konfirmasikan bahwa kamar semula salah dicatat. Gunakan Pindah Kamar untuk perpindahan fisik.";
    if (context.policies.roomCorrection.requiresEvidence && draft.evidenceFileIds.length === 0)
      errors.evidenceFileIds =
        "Tambahkan bukti pencatatan kamar yang keliru karena check-in sudah tercatat.";
    if (changed.checkIn)
      errors.checkedInDate =
        "Koreksi kamar dan tanggal check-in perlu ditinjau terpisah. Simpan salah satu koreksi dahulu, lalu buka kembali untuk koreksi berikutnya.";
  }
  if (changed.mode && !context.policies.commercialModeChange.allowed)
    errors.commercialMode = context.policies.commercialModeChange.message!;
  if (changed.mode && changed.checkIn)
    errors.checkedInDate =
      "Koreksi jenis hunian dan tanggal check-in perlu ditinjau terpisah. Simpan tanggal check-in yang benar dahulu, lalu buka kembali koreksi jenis hunian.";
  if (changed.sponsorship && !changed.mode && !context.policies.sponsorshipPolicyChange.allowed)
    errors.managementFeeMode = context.policies.sponsorshipPolicyChange.message!;
  if (
    draft.commercialMode === "rent" &&
    (changed.pricing || changed.period || changed.room || changed.mode) &&
    draft.pricingSource === "negotiated"
  ) {
    if (!Number.isSafeInteger(draft.agreedMonthlyPrice) || draft.agreedMonthlyPrice <= 0)
      errors.agreedMonthlyPrice =
        "Isi tarif kesepakatan bulanan berupa Rupiah bulat lebih dari Rp 0.";
    if (!validText(draft.pricingAgreementReason, 500))
      errors.pricingAgreementReason = "Isi catatan kesepakatan tarif 3–500 karakter.";
    if (!draft.pricingVarianceAcknowledged)
      errors.pricingVarianceAcknowledged =
        "Konfirmasikan bahwa tarif kesepakatan telah diperiksa sebelum meninjau koreksi.";
  }
  if (draft.commercialMode === "rent" && changed.mode) {
    if (!draft.paymentPlanType)
      errors.paymentPlanType = "Pilih ketentuan pelunasan untuk penyewaan berbayar yang dikoreksi.";
    if (!draft.billingCycle)
      errors.billingCycle = "Pilih siklus tagihan agar ketentuan baru dapat ditinjau.";
  }
  if (changed.sponsorship) {
    if (!z.string().uuid().safeParse(draft.sponsoringOwnerProfileId).success)
      errors.sponsoringOwnerProfileId =
        "Pilih Owner yang memiliki kamar ini. Bila belum tersedia, perbarui kepemilikan aset dahulu.";
    if (!validText(draft.ownerSponsorshipReason, 500))
      errors.ownerSponsorshipReason = "Isi alasan tanggungan Owner 3–500 karakter.";
    if (
      draft.managementFeeMode === "charged" &&
      draft.managementFeePayer === "other" &&
      (draft.managementFeePayerName.trim().length < 2 ||
        draft.managementFeePayerName.trim().length > 160)
    )
      errors.managementFeePayerName = "Isi nama penanggung biaya lain 2–160 karakter.";
  }
  if (!validText(draft.reason, 2000))
    errors.reason =
      "Isi alasan koreksi 3–2.000 karakter. Jelaskan pencatatan yang keliru dan data yang benar.";
  return errors;
}
