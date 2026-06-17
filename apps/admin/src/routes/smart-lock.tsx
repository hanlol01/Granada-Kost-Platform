import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { smartLocks, lockActivityHourly, lockAlerts, type SmartLock } from "@/lib/mock-data";
import {
  Lock, Unlock, Shield, Wifi, WifiOff, AlertTriangle, Activity, Smartphone, Battery, BatteryLow, Search, RefreshCw, Zap, DoorClosed, DoorOpen,
} from "lucide-react";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/smart-lock")({ component: SmartLockPage });

function StatCard({ icon: Icon, label, value, tone = "default", hint }: { icon: any; label: string; value: string | number; tone?: "default" | "success" | "warning" | "danger" | "primary"; hint?: string }) {
  const tones: Record<string, string> = {
    default: "bg-muted text-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/15 text-destructive",
    primary: "bg-primary-soft text-primary",
  };
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tones[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LockCard({ lock, onAction, onOpen }: { lock: SmartLock; onAction: (l: SmartLock, action: "lock" | "unlock") => void; onOpen: (l: SmartLock) => void }) {
  const restricted = lock.state === "restricted";
  const locked = lock.state === "locked" || restricted;
  return (
    <div className="group relative rounded-xl border border-border bg-card/80 backdrop-blur p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${locked ? "bg-primary text-primary-foreground" : "bg-success/15 text-success"}`}>
            {locked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">Kamar {lock.roomNumber}</p>
            <p className="text-xs text-muted-foreground truncate">{lock.tenantName ?? "Kosong"} · {lock.deviceId}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {lock.connection === "online" ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-success">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" /><span className="relative inline-flex rounded-full h-2 w-2 bg-success" /></span>
              ONLINE
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><WifiOff className="h-3 w-3" /> OFFLINE</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Status Pintu</p>
          <p className="text-sm font-semibold mt-1 flex items-center gap-1.5">
            {restricted ? (<><Shield className="h-3.5 w-3.5 text-destructive" /> Restricted</>) : locked ? (<><DoorClosed className="h-3.5 w-3.5" /> Locked</>) : (<><DoorOpen className="h-3.5 w-3.5 text-success" /> Unlocked</>)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
            {lock.battery < 20 ? <BatteryLow className="h-3 w-3 text-destructive" /> : <Battery className="h-3 w-3" />} Battery
          </p>
          <div className="mt-1.5">
            <Progress value={lock.battery} className="h-1.5" />
            <p className="text-xs font-medium mt-1">{lock.battery}%</p>
          </div>
        </div>
      </div>

      {restricted && (
        <div className="mt-3 flex items-start gap-2 text-xs bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="leading-snug">{lock.restrictedReason}</span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" /> {lock.lastActivity}</p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={lock.connection === "offline" || restricted} onClick={() => onAction(lock, locked ? "unlock" : "lock")}>
            {locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            <span className="ml-1">{locked ? "Unlock" : "Lock"}</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpen(lock)}>Detail</Button>
        </div>
      </div>
    </div>
  );
}

function SmartLockPage() {
  const [list, setList] = useState<SmartLock[]>(smartLocks);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ lock: SmartLock; action: "lock" | "unlock" } | null>(null);
  const [detail, setDetail] = useState<SmartLock | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = list.length;
    const online = list.filter((l) => l.connection === "online").length;
    const offline = total - online;
    const locked = list.filter((l) => l.state === "locked" || l.state === "restricted").length;
    const unlocked = list.filter((l) => l.state === "unlocked").length;
    const restricted = list.filter((l) => l.state === "restricted").length;
    return { total, online, offline, locked, unlocked, restricted };
  }, [list]);

  const filtered = list.filter((l) =>
    [l.roomNumber, l.tenantName ?? "", l.deviceId].join(" ").toLowerCase().includes(query.toLowerCase()),
  );

  const confirmAction = () => {
    if (!pending) return;
    const { lock, action } = pending;
    setBusyId(lock.id);
    setPending(null);
    setTimeout(() => {
      setList((prev) => prev.map((l) => (l.id === lock.id ? { ...l, state: action === "lock" ? "locked" : "unlocked", lastActivity: "Baru saja" } : l)));
      setBusyId(null);
      toast.success(`${action === "lock" ? "Locked" : "Unlocked"} kamar ${lock.roomNumber}`, {
        description: `Perintah dikirim ke device ${lock.deviceId}`,
      });
    }, 900);
  };

  return (
    <AppShell
      title="Smart Door Lock"
      subtitle="Kontrol & monitoring smart lock kamar secara realtime"
      actions={
        <Button variant="outline" size="sm" onClick={() => toast.success("Sinkronisasi device selesai")}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Sync
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard icon={Shield} label="Total Device" value={stats.total} tone="primary" />
        <StatCard icon={Wifi} label="Online" value={stats.online} tone="success" />
        <StatCard icon={WifiOff} label="Offline" value={stats.offline} tone="warning" />
        <StatCard icon={Lock} label="Locked" value={stats.locked} />
        <StatCard icon={Unlock} label="Unlocked" value={stats.unlocked} tone="success" />
        <StatCard icon={AlertTriangle} label="Restricted" value={stats.restricted} tone="danger" hint="Auto-lock billing" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Aktivitas Lock / Unlock Hari Ini</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lockActivityHourly}>
                  <defs>
                    <linearGradient id="lockG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.55 0.18 264)" stopOpacity={0.5} /><stop offset="100%" stopColor="oklch(0.55 0.18 264)" stopOpacity={0} /></linearGradient>
                    <linearGradient id="unlockG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.7 0.17 155)" stopOpacity={0.5} /><stop offset="100%" stopColor="oklch(0.7 0.17 155)" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0 / 0.3)" />
                  <XAxis dataKey="hour" stroke="currentColor" fontSize={11} />
                  <YAxis stroke="currentColor" fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)" }} />
                  <Area type="monotone" dataKey="lock" stroke="oklch(0.55 0.18 264)" fill="url(#lockG)" strokeWidth={2} />
                  <Area type="monotone" dataKey="unlock" stroke="oklch(0.7 0.17 155)" fill="url(#unlockG)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Alert Smart Lock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {lockAlerts.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${a.severity === "danger" ? "bg-destructive/15 text-destructive" : a.severity === "warning" ? "bg-warning/15 text-warning" : "bg-primary-soft text-primary"}`}>
                  <Zap className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{a.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Devices</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{filtered.length} device terpasang</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari kamar / device" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((l) => (
              <div key={l.id} className={busyId === l.id ? "opacity-70 animate-pulse" : ""}>
                <LockCard lock={l} onAction={(lock, action) => setPending({ lock, action })} onOpen={setDetail} />
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Lock className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Tidak ada device cocok</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Konfirmasi {pending?.action === "lock" ? "Lock" : "Unlock"}
            </DialogTitle>
            <DialogDescription>
              Perintah {pending?.action} akan dikirim ke device <span className="font-medium text-foreground">{pending?.lock.deviceId}</span> kamar {pending?.lock.roomNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/50 p-3 text-xs flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            Source: Admin Dashboard · End-to-end encrypted
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Batal</Button>
            <Button onClick={confirmAction}>Konfirmasi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Kamar {detail.roomNumber} · {detail.deviceId}</DialogTitle>
                <DialogDescription>{detail.tenantName ?? "Tidak ada penghuni"}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Koneksi</p><p className="font-medium mt-1 capitalize">{detail.connection}</p></div>
                <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Status</p><p className="font-medium mt-1 capitalize">{detail.state}</p></div>
                <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Battery</p><p className="font-medium mt-1">{detail.battery}%</p></div>
                <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Auto Lock</p><Badge variant={detail.autoLock ? "default" : "secondary"} className="mt-1">{detail.autoLock ? "Aktif" : "Nonaktif"}</Badge></div>
              </div>
              {detail.restrictedReason && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {detail.restrictedReason}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
