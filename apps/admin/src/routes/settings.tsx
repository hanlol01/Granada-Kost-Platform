import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggleDark = (v: boolean) => {
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
    localStorage.setItem("theme", v ? "dark" : "light");
  };

  return (
    <AppShell title="Pengaturan" subtitle="Konfigurasi rumah kos dan preferensi">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          toast.success("Pengaturan disimpan");
        }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Informasi Rumah Kos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Nama Rumah Kos</Label>
              <Input id="name" defaultValue="Kos Mawar Indah" />
            </div>
            <div>
              <Label htmlFor="addr">Alamat</Label>
              <Textarea
                id="addr"
                defaultValue="Jl. Mawar No. 12, Kelurahan Sukamaju, Jakarta Selatan"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="phone">Nomor Kontak</Label>
                <Input id="phone" defaultValue="081234567890" />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue="admin@kosmawar.id" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit">Simpan Perubahan</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:bg-muted/30 transition-colors cursor-pointer">
                <div className="h-14 w-14 mx-auto rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                  <Building2 className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium mt-3">Upload Logo</p>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG (max 2MB)</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={(e) => {
                    e.preventDefault();
                    toast.info("Fitur dummy");
                  }}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" /> Pilih File
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tampilan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Mode Gelap</p>
                  <p className="text-xs text-muted-foreground">Aktifkan tema gelap</p>
                </div>
                <Switch checked={dark} onCheckedChange={toggleDark} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Notifikasi Email</p>
                  <p className="text-xs text-muted-foreground">Pengingat jatuh tempo</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </AppShell>
  );
}
