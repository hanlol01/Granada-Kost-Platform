import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminUxMasterApi,
  type KostType,
  type KostTypeRule,
  type KostTypeRuleInput,
  type RuleCategory,
} from "@/lib/admin-ux-master-api";
import { useAuth } from "@/lib/auth";
import { useM4KostTypeRules, useM4KostTypes, useM4Mutation } from "@/hooks/useAdminUxMaster";

const RULE_CATEGORY_LABEL: Record<RuleCategory, string> = {
  general: "Umum",
  guest: "Tamu",
  resident: "Penghuni",
  other: "Lainnya",
  special_notes: "Catatan khusus",
};

export const Route = createFileRoute("/syarat-ketentuan")({
  validateSearch: (raw: Record<string, unknown>) => ({
    scope: raw.scope === "kost_type" ? ("kost_type" as const) : ("global" as const),
    kost_type_id: typeof raw.kost_type_id === "string" ? raw.kost_type_id : undefined,
  }),
  component: SyaratKetentuanRoute,
});

type RuleDraft = {
  ruleCategory: RuleCategory;
  ruleText: string;
  icon: string;
  isAllowed: boolean;
};

function SyaratKetentuanRoute() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("room.manage");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const typesQuery = useM4KostTypes({ status: "active", limit: 100 });
  const types = typesQuery.data?.items ?? [];
  const selectedTypeId =
    search.scope === "kost_type" ? (search.kost_type_id ?? types[0]?.id) : undefined;
  const rulesQuery = useM4KostTypeRules(search.scope, selectedTypeId);
  const [editor, setEditor] = useState<KostTypeRule | "create" | null>(null);

  if (typesQuery.isLoading || rulesQuery.isLoading) {
    return (
      <AppShell title="Syarat & Ketentuan" subtitle="Aturan global dan per tipe kost">
        <LoadingState label="Memuat aturan..." />
      </AppShell>
    );
  }
  if (typesQuery.error || rulesQuery.error) {
    return (
      <AppShell title="Syarat & Ketentuan" subtitle="Aturan global dan per tipe kost">
        <ErrorState
          error={typesQuery.error ?? rulesQuery.error}
          title="Gagal memuat aturan"
          onRetry={() => {
            void typesQuery.refetch();
            void rulesQuery.refetch();
          }}
        />
      </AppShell>
    );
  }

  const rules = rulesQuery.data?.items ?? [];
  const updateSearch = (next: Partial<typeof search>) =>
    navigate({ search: (current) => ({ ...current, ...next }) });
  return (
    <AppShell
      title="Syarat & Ketentuan"
      subtitle="Aturan yang dipakai bersama atau khusus pada setiap tipe kost."
      actions={
        canManage ? (
          <Button
            onClick={() => setEditor("create")}
            disabled={search.scope === "kost_type" && !selectedTypeId}
          >
            <Plus className="mr-2 h-4 w-4" /> Tambah Aturan
          </Button>
        ) : null
      }
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        <Card className="border-slate-800 bg-slate-900/85">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2">
            <Select
              value={search.scope}
              onValueChange={(scope) =>
                updateSearch({
                  scope: scope as "global" | "kost_type",
                  kost_type_id: scope === "global" ? undefined : types[0]?.id,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Aturan global</SelectItem>
                <SelectItem value="kost_type">Aturan per tipe kost</SelectItem>
              </SelectContent>
            </Select>
            {search.scope === "kost_type" ? (
              <Select
                value={selectedTypeId ?? "none"}
                onValueChange={(kost_type_id) =>
                  updateSearch({ kost_type_id: kost_type_id === "none" ? undefined : kost_type_id })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tipe kost" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pilih tipe kost</SelectItem>
                  {types.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="self-center text-sm text-slate-400">
                Aturan ini berlaku untuk seluruh tipe kost pada properti aktif.
              </p>
            )}
          </CardContent>
        </Card>
        <RuleList
          rules={rules}
          kostTypeId={selectedTypeId}
          canManage={canManage}
          onEdit={setEditor}
        />
      </div>
      <RuleEditor
        rule={editor === "create" ? null : editor}
        kostTypeId={selectedTypeId ?? null}
        scope={search.scope}
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
      />
    </AppShell>
  );
}

function RuleList({
  rules,
  kostTypeId,
  canManage,
  onEdit,
}: {
  rules: KostTypeRule[];
  kostTypeId?: string;
  canManage: boolean;
  onEdit: (rule: KostTypeRule) => void;
}) {
  const reorder = useM4Mutation<unknown, { items: { id: string; sortOrder: number }[] }>(
    "rule",
    "Urutan aturan disimpan",
    (propertyId, values, key) =>
      adminUxMasterApi.rules.reorder(propertyId, kostTypeId, values.items, key),
  );
  const remove = useM4Mutation<unknown, { id: string }>(
    "rule",
    "Aturan dihapus",
    (_propertyId, values, key) => adminUxMasterApi.rules.remove(values.id, key),
  );
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    void reorder.mutateAsync({
      items: next.map((item, sortOrder) => ({ id: item.id, sortOrder })),
    });
  };
  if (!rules.length) {
    return (
      <Card className="border-slate-800 bg-slate-900/85">
        <CardContent className="p-6">
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title="Belum ada aturan"
            description="Tambahkan aturan agar ketentuan tampil konsisten pada tipe kost."
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {rules.map((rule, index) => (
        <Card key={rule.id} className="border-slate-800 bg-slate-900/85">
          <CardContent className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300">
                  {RULE_CATEGORY_LABEL[rule.ruleCategory]}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    rule.isAllowed === false
                      ? "border-rose-500/30 text-rose-300"
                      : "border-emerald-500/30 text-emerald-300"
                  }
                >
                  {rule.isAllowed === false ? "Tidak diizinkan" : "Diizinkan"}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-200">{rule.ruleText}</p>
            </div>
            {canManage ? (
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                  aria-label="Naikkan aturan"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={index === rules.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                  aria-label="Turunkan aturan"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onEdit(rule)}
                  aria-label="Edit aturan"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-rose-300 hover:text-rose-200"
                  onClick={() => {
                    if (window.confirm("Hapus aturan ini?"))
                      void remove.mutateAsync({ id: rule.id });
                  }}
                  aria-label="Hapus aturan"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RuleEditor({
  rule,
  scope,
  kostTypeId,
  open,
  onOpenChange,
}: {
  rule: KostTypeRule | null;
  scope: "global" | "kost_type";
  kostTypeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>({
    ruleCategory: "general",
    ruleText: "",
    icon: "",
    isAllowed: true,
  });
  const create = useM4Mutation<
    KostTypeRule,
    Omit<KostTypeRuleInput, "propertyId" | "kostTypeId"> & { kostTypeId: string | null }
  >("rule", "Aturan disimpan", (propertyId, values, key) =>
    adminUxMasterApi.rules.create({ ...values, propertyId }, key),
  );
  const update = useM4Mutation<KostTypeRule, { id: string; input: RuleDraft }>(
    "rule",
    "Aturan diperbarui",
    (_propertyId, values, key) => adminUxMasterApi.rules.update(values.id, values.input, key),
  );
  const pending = create.isPending || update.isPending;
  useEffect(() => {
    if (open)
      setDraft({
        ruleCategory: rule?.ruleCategory ?? "general",
        ruleText: rule?.ruleText ?? "",
        icon: rule?.icon ?? "",
        isAllowed: rule?.isAllowed !== false,
      });
  }, [open, rule]);
  const submit = async () => {
    if (!draft.ruleText.trim()) return;
    try {
      if (rule) await update.mutateAsync({ id: rule.id, input: draft });
      else
        await create.mutateAsync({
          ...draft,
          kostTypeId: scope === "kost_type" ? kostTypeId : null,
        });
      onOpenChange(false);
    } catch {
      /* safe toast */
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit aturan" : "Tambah aturan"}</DialogTitle>
          <DialogDescription>
            {scope === "global"
              ? "Aturan ini berlaku global."
              : "Aturan ini berlaku untuk tipe kost yang dipilih."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Kategori aturan</Label>
            <Select
              value={draft.ruleCategory}
              onValueChange={(ruleCategory) =>
                setDraft((current) => ({ ...current, ruleCategory: ruleCategory as RuleCategory }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RULE_CATEGORY_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Isi aturan</Label>
            <Textarea
              value={draft.ruleText}
              maxLength={1000}
              rows={5}
              onChange={(event) =>
                setDraft((current) => ({ ...current, ruleText: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ikon (opsional)</Label>
            <Input
              value={draft.icon}
              maxLength={80}
              onChange={(event) =>
                setDraft((current) => ({ ...current, icon: event.target.value }))
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
            <Label>Aturan diizinkan</Label>
            <Switch
              checked={draft.isAllowed}
              onCheckedChange={(isAllowed) => setDraft((current) => ({ ...current, isAllowed }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button disabled={!draft.ruleText.trim() || pending} onClick={() => void submit()}>
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
