import { billingEvidenceUnavailableCopy, type BillingEvidence } from "@/lib/billing-evidence-contract";

export function BillingEvidenceUnavailable({ file }: { file: BillingEvidence }) {
  const copy = billingEvidenceUnavailableCopy(file);
  return (
    <div className="min-w-0 space-y-1 text-sm text-foreground">
      <p className="font-semibold">{copy.title}</p>
      <p className="max-w-prose break-words">{copy.description}</p>
      {file.purged_at ? (
        <p>
          Terverifikasi dihapus: {new Intl.DateTimeFormat("id-ID", {
            day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
          }).format(new Date(file.purged_at))}
        </p>
      ) : null}
    </div>
  );
}
