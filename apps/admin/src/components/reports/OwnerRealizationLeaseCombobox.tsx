import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OwnerRealizationLeaseOption = {
  leaseId: string;
  roomCode: string;
  residentName: string;
  paymentSourcePeriod: string;
};

type Props = {
  id: string;
  value: string;
  options: OwnerRealizationLeaseOption[];
  emptyMessage?: string;
  loading?: boolean;
  disabled?: boolean;
  onChange: (leaseId: string) => void;
};

export function OwnerRealizationLeaseCombobox({
  id,
  value,
  options,
  emptyMessage = "Tidak ada kontrak lunas yang dapat direalisasikan.",
  loading = false,
  disabled = false,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>();
  const anchorRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const dialogScrollTopRef = useRef(0);
  const selected = options.find((option) => option.leaseId === value) ?? null;
  const visibleOptions = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("id-ID");
    return options.filter((option) =>
      !normalized
        ? true
        : `${option.roomCode} ${option.residentName} ${option.paymentSourcePeriod}`
            .toLocaleLowerCase("id-ID")
            .includes(normalized),
    );
  }, [options, search]);

  const restoreDialogScroll = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const top = dialogScrollTopRef.current;
    window.requestAnimationFrame(() => {
      dialog.scrollTop = top;
    });
    window.setTimeout(() => {
      dialog.scrollTop = top;
    }, 0);
  };

  const openMenu = () => {
    if (disabled) return;
    const anchor = anchorRef.current;
    const dialog = anchor?.closest<HTMLElement>('[role="dialog"]') ?? null;
    dialogRef.current = dialog;
    dialogScrollTopRef.current = dialog?.scrollTop ?? 0;
    setPortalContainer(dialog);
    setPanelWidth(anchor?.getBoundingClientRect().width);
    setSearch("");
    setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={(next) => (next ? openMenu() : setOpen(false))}>
      <PopoverAnchor asChild>
        <div ref={anchorRef}>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            disabled={disabled}
            onClick={() => (open ? setOpen(false) : openMenu())}
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs outline-none transition-colors hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>
              {selected
                ? `${selected.roomCode} · ${selected.residentName}`
                : "Cari kamar atau penghuni"}
            </span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-muted-foreground", open && "rotate-180")}
            />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        portalContainer={portalContainer}
        style={{ width: panelWidth, maxWidth: "calc(100vw - 2rem)" }}
        className="min-w-0 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          restoreDialogScroll();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          anchorRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
          restoreDialogScroll();
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Cari kamar atau penghuni..."
          />
          <CommandList className="max-h-[min(18rem,45vh)] touch-pan-y overscroll-contain overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat kontrak...
              </div>
            ) : null}
            {!loading && visibleOptions.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : null}
            {visibleOptions.length ? (
              <CommandGroup heading="Kontrak lunas yang belum direalisasikan">
                {visibleOptions.map((option) => (
                  <CommandItem
                    key={option.leaseId}
                    value={option.leaseId}
                    onSelect={() => {
                      onChange(option.leaseId);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        value === option.leaseId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">
                        {option.roomCode} · {option.residentName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Pelunasan {option.paymentSourcePeriod}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
