import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { Eye, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useContentPublicationMutation,
  usePropertyPolicyWorkspace,
} from "@/hooks/useAdminUxMaster";
import {
  adminUxMasterApi,
  type PropertyPolicyDraftInput,
  type PropertyPolicyWorkspace,
  type PublicTermsContent,
} from "@/lib/admin-ux-master-api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/syarat-ketentuan")({
  component: SyaratKetentuanRoute,
});

type PolicyDraft = {
  internalOperatingPolicy: string;
  pricingExplanation: string;
  minimumLeaseTerm: string;
  dpExplanation: string;
  securityDepositExplanation: string;
  manualPaymentMethods: string;
  houseRules: string;
  visitorHours: string;
  contactInformation: string;
  categories: Array<"rukost" | "apartkost">;
};

const EMPTY_DRAFT: PolicyDraft = {
  internalOperatingPolicy: "",
  pricingExplanation: "",
  minimumLeaseTerm: "",
  dpExplanation: "",
  securityDepositExplanation: "",
  manualPaymentMethods: "",
  houseRules: "",
  visitorHours: "21:00",
  contactInformation: "",
  categories: ["rukost", "apartkost"],
};
const today = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

function SyaratKetentuanRoute() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("room.manage");
  const workspace = usePropertyPolicyWorkspace();
  const [draft, setDraft] = useState<PolicyDraft>(EMPTY_DRAFT);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    setDraft(workspace.data?.draft ? fromAuthority(workspace.data.draft) : EMPTY_DRAFT);
    setPreview(false);
  }, [workspace.data]);

  const save = useContentPublicationMutation<
    PropertyPolicyWorkspace,
    Omit<PropertyPolicyDraftInput, "propertyId">
  >("property-policy", "Draft kebijakan disimpan", (propertyId, values, key) =>
    adminUxMasterApi.propertyPolicy.saveDraft({ ...values, propertyId }, key),
  );
  const publish = useContentPublicationMutation<PropertyPolicyWorkspace, { effectiveDate: string }>(
    "property-policy",
    "Kebijakan dijadwalkan untuk publikasi",
    (propertyId, values, key) =>
      adminUxMasterApi.propertyPolicy.publish(propertyId, values.effectiveDate, key),
  );
  const restore = useContentPublicationMutation<PropertyPolicyWorkspace, { versionId: string }>(
    "property-policy",
    "Versi kebijakan dipulihkan sebagai draft",
    (propertyId, values, key) =>
      adminUxMasterApi.propertyPolicy.restore(propertyId, values.versionId, key),
  );
  const unpublish = useContentPublicationMutation<PropertyPolicyWorkspace, Record<string, never>>(
    "property-policy",
    "Publikasi syarat dan ketentuan dinonaktifkan",
    (propertyId, _values, key) => adminUxMasterApi.propertyPolicy.unpublish(propertyId, key),
  );

  const publicContent = useMemo(() => toPublicContent(draft), [draft]);
  const valid = isDraftValid(draft);
  const busy = save.isPending || publish.isPending || restore.isPending || unpublish.isPending;
  const isDirty =
    JSON.stringify(draft) !==
    JSON.stringify(workspace.data?.draft ? fromAuthority(workspace.data.draft) : EMPTY_DRAFT);

  useBlocker({
    shouldBlockFn: () =>
      isDirty && !window.confirm("Perubahan draft kebijakan belum disimpan. Tinggalkan halaman?"),
    enableBeforeUnload: isDirty,
  });

  if (workspace.isLoading) {
    return (
      <AppShell title="Syarat & Ketentuan" subtitle="Kebijakan internal dan konten publik">
        <LoadingState label="Memuat kebijakan properti..." />
      </AppShell>
    );
  }
  if (workspace.error) {
    return (
      <AppShell title="Syarat & Ketentuan" subtitle="Kebijakan internal dan konten publik">
        <ErrorState
          error={workspace.error}
          title="Gagal memuat kebijakan properti"
          onRetry={() => void workspace.refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Syarat & Ketentuan"
      subtitle="Kebijakan operasional internal dipisahkan dari konten aman untuk calon penghuni."
      actions={
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => setPreview((current) => !current)}
        >
          <Eye className="mr-2 h-4 w-4" />
          {preview ? "Tutup preview" : "Preview draft publik"}
        </Button>
      }
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        <Card>
          <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Dokumen kebijakan properti</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Draft dapat diubah; versi published bersifat immutable.
              </p>
            </div>
            <Badge variant="outline">
              {workspace.data?.versions.find((version) => version.publicationStatus === "published")
                ? `Published v${workspace.data.versions.find((version) => version.publicationStatus === "published")?.version}`
                : "Belum published"}
            </Badge>
          </CardHeader>
        </Card>

        {preview ? (
          <PublicPreview content={publicContent} />
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Kebijakan operasional internal</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Tidak pernah masuk ke projection publik.
                </p>
              </CardHeader>
              <CardContent>
                <Label htmlFor="internal-policy">Catatan operasional</Label>
                <Textarea
                  id="internal-policy"
                  rows={18}
                  maxLength={5000}
                  value={draft.internalOperatingPolicy}
                  disabled={!canManage || busy}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      internalOperatingPolicy: event.target.value,
                    }))
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Konten aman untuk publik</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Hanya field terstruktur ini yang dapat dipublikasikan.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  id="pricing-explanation"
                  label="Penjelasan harga"
                  value={draft.pricingExplanation}
                  maxLength={2000}
                  disabled={!canManage || busy}
                  onChange={(pricingExplanation) =>
                    setDraft((current) => ({ ...current, pricingExplanation }))
                  }
                />
                <div>
                  <Label htmlFor="minimum-lease-term">Masa sewa minimum</Label>
                  <Input
                    id="minimum-lease-term"
                    className="min-h-11"
                    maxLength={300}
                    value={draft.minimumLeaseTerm}
                    disabled={!canManage || busy}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        minimumLeaseTerm: event.target.value,
                      }))
                    }
                  />
                </div>
                <Field
                  id="dp-explanation"
                  label="Penjelasan DP"
                  value={draft.dpExplanation}
                  maxLength={2000}
                  disabled={!canManage || busy}
                  onChange={(dpExplanation) =>
                    setDraft((current) => ({ ...current, dpExplanation }))
                  }
                />
                <Field
                  id="deposit-explanation"
                  label="Penjelasan security deposit"
                  value={draft.securityDepositExplanation}
                  maxLength={2000}
                  disabled={!canManage || busy}
                  onChange={(securityDepositExplanation) =>
                    setDraft((current) => ({ ...current, securityDepositExplanation }))
                  }
                />
                <Field
                  id="manual-payment-methods"
                  label="Metode pembayaran manual (satu per baris)"
                  value={draft.manualPaymentMethods}
                  disabled={!canManage || busy}
                  onChange={(manualPaymentMethods) =>
                    setDraft((current) => ({ ...current, manualPaymentMethods }))
                  }
                />
                <Field
                  id="house-rules"
                  label="Aturan hunian publik (satu per baris)"
                  value={draft.houseRules}
                  disabled={!canManage || busy}
                  onChange={(houseRules) => setDraft((current) => ({ ...current, houseRules }))}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="visitor-hours">Batas jam kunjungan</Label>
                    <Input
                      id="visitor-hours"
                      className="min-h-11"
                      type="time"
                      value={draft.visitorHours}
                      disabled={!canManage || busy}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          visitorHours: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="public-contact">Kontak publik</Label>
                    <Input
                      id="public-contact"
                      className="min-h-11"
                      maxLength={500}
                      value={draft.contactInformation}
                      disabled={!canManage || busy}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          contactInformation: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <fieldset className="rounded-xl border p-4">
                  <legend className="px-1 text-sm font-medium">Berlaku untuk kategori</legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {[
                      ["rukost", "Rumah Kost"],
                      ["apartkost", "Apart Kost"],
                    ].map(([value, label]) => (
                      <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.categories.includes(value as "rukost" | "apartkost")}
                          disabled={!canManage || busy}
                          onChange={() =>
                            setDraft((current) => ({
                              ...current,
                              categories: toggleCategory(
                                current.categories,
                                value as "rukost" | "apartkost",
                              ),
                            }))
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </CardContent>
            </Card>
          </div>
        )}

        {canManage ? (
          <Card>
            <CardContent className="flex flex-wrap items-end justify-end gap-3 p-4">
              <div className="min-w-48">
                <Label htmlFor="policy-effective-date">Tanggal efektif publikasi</Label>
                <Input
                  id="policy-effective-date"
                  className="min-h-11"
                  type="date"
                  value={effectiveDate}
                  onChange={(event) => setEffectiveDate(event.target.value)}
                />
              </div>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={busy || !valid}
                onClick={() =>
                  void save.mutateAsync({
                    internalOperatingPolicy: draft.internalOperatingPolicy,
                    publicContent,
                  })
                }
              >
                <Save className="mr-2 h-4 w-4" /> Simpan draft
              </Button>
              <Button
                className="min-h-11"
                disabled={busy || !valid || !workspace.data?.draft || !effectiveDate || isDirty}
                onClick={() => {
                  if (
                    !window.confirm("Publikasikan draft syarat dan ketentuan yang sudah disimpan?")
                  ) {
                    return;
                  }
                  void publish.mutateAsync({ effectiveDate });
                }}
              >
                <ShieldCheck className="mr-2 h-4 w-4" /> Publikasikan
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={
                  busy ||
                  !workspace.data?.versions.some(
                    (version) => version.publicationStatus === "published",
                  )
                }
                onClick={() => {
                  if (!window.confirm("Hentikan seluruh publikasi syarat dan ketentuan?")) return;
                  void unpublish.mutateAsync({});
                }}
              >
                Unpublish
              </Button>
            </CardContent>
            {isDirty ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground" role="status">
                Simpan perubahan draft sebelum publikasi.
              </p>
            ) : null}
            {!valid ? (
              <p className="px-4 pb-4 text-sm text-destructive" role="alert">
                Lengkapi seluruh konten publik, metode pembayaran, kategori, dan format jam.
              </p>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Riwayat versi published</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {workspace.data?.versions.length ? (
              workspace.data.versions.map((version) => (
                <div
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="text-sm">
                    Versi {version.version} · efektif {version.effectiveDate}
                  </span>
                  <Badge variant="outline">
                    {version.publicationStatus === "published" ? "Published" : "Archived"}
                  </Badge>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={!canManage || busy}
                    onClick={() => {
                      if (!window.confirm("Pulihkan versi ini sebagai draft baru?")) return;
                      void restore.mutateAsync({ versionId: version.id });
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Pulihkan sebagai draft
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada versi published.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Field({
  id,
  label,
  value,
  disabled,
  maxLength,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={3}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function PublicPreview({ content }: { content: PublicTermsContent }) {
  return (
    <Card aria-label="Preview konten publik">
      <CardHeader>
        <CardTitle>Preview publik</CardTitle>
        <p className="text-sm text-muted-foreground">
          Catatan internal tidak ditampilkan pada preview ini.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <PreviewSection title="Harga dan masa sewa">
          <p>{content.pricingExplanation}</p>
          <p>{content.minimumLeaseTerm}</p>
        </PreviewSection>
        <PreviewSection title="DP dan security deposit">
          <p>{content.dpExplanation}</p>
          <p>{content.securityDepositExplanation}</p>
        </PreviewSection>
        <PreviewSection title="Pembayaran">
          <List items={content.manualPaymentMethods} />
        </PreviewSection>
        <PreviewSection title="Aturan hunian">
          <List items={content.houseRules} />
          <p>Jam kunjungan sampai {content.visitorHours}</p>
        </PreviewSection>
        <PreviewSection title="Kontak">
          <p>{content.contactInformation}</p>
        </PreviewSection>
        <PreviewSection title="Kategori">
          <p>
            {content.categoryApplicability
              .map((category) => (category === "rukost" ? "Rumah Kost" : "Apart Kost"))
              .join(" · ")}
          </p>
        </PreviewSection>
      </CardContent>
    </Card>
  );
}

function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <div className="space-y-2 break-words text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function fromAuthority(draft: NonNullable<PropertyPolicyWorkspace["draft"]>): PolicyDraft {
  return {
    internalOperatingPolicy: draft.internalOperatingPolicy,
    pricingExplanation: draft.publicContent.pricingExplanation,
    minimumLeaseTerm: draft.publicContent.minimumLeaseTerm,
    dpExplanation: draft.publicContent.dpExplanation,
    securityDepositExplanation: draft.publicContent.securityDepositExplanation,
    manualPaymentMethods: draft.publicContent.manualPaymentMethods.join("\n"),
    houseRules: draft.publicContent.houseRules.join("\n"),
    visitorHours: draft.publicContent.visitorHours,
    contactInformation: draft.publicContent.contactInformation,
    categories: draft.publicContent.categoryApplicability,
  };
}

function toPublicContent(draft: PolicyDraft): PublicTermsContent {
  const lines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  return {
    pricingExplanation: draft.pricingExplanation.trim(),
    minimumLeaseTerm: draft.minimumLeaseTerm.trim(),
    dpExplanation: draft.dpExplanation.trim(),
    securityDepositExplanation: draft.securityDepositExplanation.trim(),
    manualPaymentMethods: lines(draft.manualPaymentMethods),
    houseRules: lines(draft.houseRules),
    visitorHours: draft.visitorHours,
    contactInformation: draft.contactInformation.trim(),
    categoryApplicability: draft.categories,
  };
}

function isDraftValid(draft: PolicyDraft): boolean {
  const content = toPublicContent(draft);
  return (
    Boolean(draft.internalOperatingPolicy.trim()) &&
    Boolean(content.pricingExplanation) &&
    Boolean(content.minimumLeaseTerm) &&
    Boolean(content.dpExplanation) &&
    Boolean(content.securityDepositExplanation) &&
    content.manualPaymentMethods.length > 0 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(content.visitorHours) &&
    Boolean(content.contactInformation) &&
    content.categoryApplicability.length > 0
  );
}

function toggleCategory(
  categories: Array<"rukost" | "apartkost">,
  category: "rukost" | "apartkost",
) {
  return categories.includes(category)
    ? categories.filter((item) => item !== category)
    : [...categories, category];
}
