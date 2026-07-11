import { Link } from "@tanstack/react-router";
import { ToggleLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FeatureDisabledState({
  title = "Fitur belum diaktifkan",
  description = "Fitur ini belum tersedia untuk properti atau rilis saat ini.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <ToggleLeft className="h-7 w-7" />
      </div>
      <div className="max-w-md">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild className="bg-blue-600 text-white hover:bg-blue-500">
        <Link to="/">Kembali ke Dashboard</Link>
      </Button>
    </div>
  );
}
