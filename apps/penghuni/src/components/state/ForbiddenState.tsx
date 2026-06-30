import { ShieldAlert } from "lucide-react";

export function ForbiddenState({
  title = "Tidak berwenang",
  description = "Akun Anda tidak memiliki izin untuk membuka halaman ini.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/20 text-warning">
        <ShieldAlert className="h-5 w-5" />
      </div>
      <div className="max-w-md">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
