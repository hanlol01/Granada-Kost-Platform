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

type OwnerOption = {
  id: string;
  fullName: string;
};

type Props = {
  id: string;
  value: string;
  owners: OwnerOption[];
  loading?: boolean;
  disabled?: boolean;
  required?: boolean;
  onChange: (ownerId: string) => void;
};

export function OwnerRealizationOwnerCombobox({
  id,
  value,
  owners,
  loading = false,
  disabled = false,
  required = false,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>();
  const anchorRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const dialogScrollTopRef = useRef(0);
  const selected = owners.find((owner) => owner.id === value) ?? null;
  const visibleOwners = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("id-ID");
    return [...owners]
      .sort((left, right) => left.fullName.localeCompare(right.fullName, "id"))
      .filter(
        (owner) => !normalized || owner.fullName.toLocaleLowerCase("id-ID").includes(normalized),
      );
  }, [owners, search]);

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
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) openMenu();
        else setOpen(false);
      }}
    >
      <PopoverAnchor asChild>
        <div ref={anchorRef}>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-required={required || undefined}
            disabled={disabled}
            onClick={() => (open ? setOpen(false) : openMenu())}
            className="owner-report-filter__month-picker flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm font-medium shadow-xs outline-none transition-colors hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>
              {selected?.fullName ?? "Cari dan pilih Owner Property"}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
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
            placeholder="Ketik nama Owner Property..."
          />
          <CommandList className="max-h-[min(18rem,45vh)] touch-pan-y overscroll-contain overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat Owner...
              </div>
            ) : null}
            {!loading && visibleOwners.length === 0 ? (
              <CommandEmpty>Tidak ada Owner aktif yang cocok.</CommandEmpty>
            ) : null}
            {visibleOwners.length ? (
              <CommandGroup heading="Owner aktif pada properti ini">
                {visibleOwners.map((owner) => (
                  <CommandItem
                    key={owner.id}
                    value={owner.id}
                    onSelect={() => {
                      onChange(owner.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn("h-4 w-4", value === owner.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{owner.fullName}</span>
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
