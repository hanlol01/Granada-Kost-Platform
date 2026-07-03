import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accessLogs } from "@/lib/mock-data";
import { Search, Download, Lock, Unlock, CheckCircle2, XCircle, History, Smartphone, ShieldCheck, Filter } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/access-history")({ component: AccessHistoryPage });

const PAGE_SIZE = 10;

function AccessHistoryPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return accessLogs.filter((l) => {
      if (typeFilter !== "all" && l.type !== typeFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (query && !`${l.tenantName} ${l.roomNumber}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query, typeFilter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const successCount = filtered.filter((l) => l.status === "success").length;
  const failCount = filtered.length - successCount;

  return (
    <AppShell
      title="Access History"
      subtitle="Riwayat lengkap aktivitas smart lock"
      actions={
        <Button size="sm" variant="outline" onClick={() => toast.success("Export CSV berhasil (dummy)")}>
          <Download className="h-4 w-4 mr-1.5" /> Export
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center"><History className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Total Akses</p><p className="text-xl font-semibold">{filtered.length}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-success/15 text-success flex items-center justify-center"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Success</p><p className="text-xl font-semibold">{successCount}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center"><XCircle className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Failed</p><p className="text-xl font-semibold">{failCount}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-warning/15 text-warning flex items-center justify-center"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Security Score</p><p className="text-xl font-semibold">98%</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" /> Filter</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari nama / kamar" className="pl-9" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Jenis" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Jenis</SelectItem>
                <SelectItem value="lock">Lock</SelectItem>
                <SelectItem value="unlock">Unlock</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Sumber" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Sumber</SelectItem>
                <SelectItem value="Mobile App">Mobile App</SelectItem>
                <SelectItem value="Admin Dashboard">Admin Dashboard</SelectItem>
                <SelectItem value="Auto Lock">Auto Lock</SelectItem>
                <SelectItem value="Billing System">Billing System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr className="text-left">
                  <th className="py-3 px-3 font-medium">Waktu</th>
                  <th className="py-3 px-3 font-medium">Penghuni</th>
                  <th className="py-3 px-3 font-medium">Kamar</th>
                  <th className="py-3 px-3 font-medium">Aksi</th>
                  <th className="py-3 px-3 font-medium">Sumber</th>
                  <th className="py-3 px-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors animate-fade-in">
                    <td className="py-3 px-3 text-xs text-muted-foreground">{new Date(l.time).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="py-3 px-3 font-medium">{l.tenantName}</td>
                    <td className="py-3 px-3">{l.roomNumber}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${l.type === "lock" ? "text-primary" : "text-success"}`}>
                        {l.type === "lock" ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        {l.type === "lock" ? "Lock" : "Unlock"}
                      </span>
                    </td>
                    <td className="py-3 px-3"><Badge variant="secondary" className="font-normal"><Smartphone className="h-3 w-3 mr-1" />{l.source}</Badge></td>
                    <td className="py-3 px-3">
                      {l.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Success</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium"><XCircle className="h-3.5 w-3.5" /> Failed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {paged.map((l) => (
              <div key={l.id} className="rounded-lg border border-border p-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${l.type === "lock" ? "bg-primary-soft text-primary" : "bg-success/15 text-success"}`}>
                      {l.type === "lock" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{l.tenantName}</p>
                      <p className="text-[11px] text-muted-foreground">Kamar {l.roomNumber} · {l.source}</p>
                    </div>
                  </div>
                  {l.status === "success" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">{new Date(l.time).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</p>
              </div>
            ))}
          </div>

          {paged.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Tidak ada riwayat akses cocok</p>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <p>Halaman {page} dari {totalPages}</p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
