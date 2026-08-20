import { useEffect, useMemo, useState } from "react";
import { Braces, CheckCircle2, FilePenLine, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { newIdempotencyKey } from "@/lib/idempotency";

const REQUIRED_VARIABLES = [
  "{{resident_name}}",
  "{{room_number}}",
  "{{property_name}}",
  "{{invoice_periods}}",
  "{{invoice_total_outstanding}}",
  "{{lease_start_date}}",
  "{{lease_end_date}}",
  "{{payment_due_date}}",
  "{{days_remaining}}",
  "{{admin_whatsapp}}",
  "{{invoice_download_links}}",
] as const;

const DEFAULT_TITLE = "Pengingat tagihan untuk {{resident_name}}";
const DEFAULT_BODY = `Halo {{resident_name}},

Berikut pengingat tagihan untuk kamar {{room_number}} di {{property_name}}.
Periode: {{invoice_periods}}
Total yang belum dibayar: {{invoice_total_outstanding}}
Jatuh tempo: {{payment_due_date}} ({{days_remaining}} hari lagi)
Masa sewa: {{lease_start_date}} sampai {{lease_end_date}}

{{invoice_download_links}}

Jika perlu bantuan, hubungi Admin melalui {{admin_whatsapp}}.`;

type Template = {
  version: number;
  title_template: string;
  body_template: string;
};

export function ReminderTemplateDialog({ propertyId }: { propertyId: string | null }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [version, setVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !propertyId) return;
    let live = true;
    setBusy(true);
    setError(null);
    void adminUxV2Requester
      .get<Template>("/admin/reminders/templates/active", { query: { property_id: propertyId } })
      .then((template) => {
        if (!live) return;
        setTitle(template.title_template);
        setBody(template.body_template);
        setVersion(template.version);
      })
      .catch(() => {
        if (live) setError("Template belum dapat dimuat. Anda tetap dapat menyusun template baru.");
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [open, propertyId]);

  const missingVariables = useMemo(
    () => REQUIRED_VARIABLES.filter((variable) => !`${title}\n${body}`.includes(variable)),
    [body, title],
  );

  async function save() {
    if (!propertyId || missingVariables.length) return;
    setBusy(true);
    setError(null);
    try {
      const next = await adminUxV2Requester.post<Template>(
        "/admin/reminders/templates",
        { property_id: propertyId, title_template: title, body_template: body },
        { idempotencyKey: newIdempotencyKey() },
      );
      setVersion(next.version);
      setOpen(false);
    } catch {
      setError(
        "Template belum disimpan. Pastikan seluruh variabel wajib dipertahankan dan coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={!propertyId}
        onClick={() => setOpen(true)}
      >
        <FilePenLine className="mr-2 h-4 w-4" />
        Kelola template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Template pengingat tagihan</DialogTitle>
            <DialogDescription>
              Setiap penyimpanan membuat versi baru. Data penghuni, tagihan, dan tautan invoice
              selalu diisi oleh server saat pesan dibuat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Braces className="h-4 w-4 text-primary" />
                <p className="font-semibold text-primary">Variabel wajib yang dilindungi</p>
                {version ? <Badge variant="outline">Versi aktif {version}</Badge> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {REQUIRED_VARIABLES.map((variable) => {
                  const present = !missingVariables.includes(variable);
                  return (
                    <Badge
                      key={variable}
                      variant="outline"
                      className={
                        present
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-destructive/40 bg-destructive/10 text-destructive"
                      }
                    >
                      {present ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
                      {variable}
                    </Badge>
                  );
                })}
              </div>
              {missingVariables.length ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  Masukkan kembali {missingVariables.length} variabel wajib sebelum menyimpan.
                </p>
              ) : null}
            </div>
            <label className="grid gap-2 text-sm font-medium">
              Judul pesan
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Isi pesan
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-72 resize-y leading-6"
              />
            </label>
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="secondary" className="min-h-11" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              className="min-h-11"
              disabled={busy || missingVariables.length > 0 || !title.trim() || !body.trim()}
              onClick={() => void save()}
            >
              <Save className="mr-2 h-4 w-4" />
              {busy ? "Menyimpan..." : "Simpan versi baru"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
