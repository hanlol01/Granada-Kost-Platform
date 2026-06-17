import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { tenants as initial, type Tenant } from "@/lib/mock-data";
import { formatDate } from "@/lib/format";
import { Search, Eye, Pencil, Users, Phone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/tenants")({ component: TenantsPage });

function TenantsPage() {
  const [list] = useState<Tenant[]>(initial);
  const [q, setQ] = useState("");
  const [view, setView] = useState<Tenant | null>(null);

  const filtered = useMemo(
    () => list.filter((t) => q === "" || t.name.toLowerCase().includes(q.toLowerCase()) || t.roomNumber.includes(q) || t.phone.includes(q)),
    [list, q],
  );

  return (
    <AppShell title="Data Penghuni" subtitle={`${list.length} penghuni terdaftar`}>
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, kamar, atau HP..." className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Penghuni</th>
                  <th className="px-5 py-3 font-medium">Kamar</th>
                  <th className="px-5 py-3 font-medium">Kontak</th>
                  <th className="px-5 py-3 font-medium">Tanggal Masuk</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold text-sm">
                          {t.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.ktp}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3"><span className="font-medium">#{t.roomNumber}</span></td>
                    <td className="px-5 py-3 text-muted-foreground">{t.phone}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(t.joinDate)}</td>
                    <td className="px-5 py-3"><StatusBadge status={t.paymentStatus} /></td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setView(t)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-border">
            {filtered.map((t) => (
              <div key={t.id} className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold">{t.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{t.phone} · Kamar {t.roomNumber}</p>
                </div>
                <StatusBadge status={t.paymentStatus} />
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="mt-3 font-medium">Tidak ada penghuni</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detail Penghuni</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="h-14 w-14 rounded-full bg-primary-soft text-primary flex items-center justify-center text-xl font-semibold">{view.name.charAt(0)}</div>
                <div>
                  <p className="font-semibold text-base">{view.name}</p>
                  <p className="text-xs text-muted-foreground">Kamar #{view.roomNumber}</p>
                </div>
              </div>
              <Row label="Nomor HP" value={view.phone} />
              <Row label="Nomor KTP" value={view.ktp} />
              <Row label="Tanggal Masuk" value={formatDate(view.joinDate)} />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status Pembayaran</span>
                <StatusBadge status={view.paymentStatus} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
