import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
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

type Props = {
  id: string;
  value: string;
  options: string[];
  loading?: boolean;
  required?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  storedLabel?: string;
  addLabel?: string;
  emptyMessage?: string;
  onChange: (value: string) => void;
};

function normalizeSource(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

export function HistoricalRealizationSourceCombobox({
  id,
  value,
  options,
  loading = false,
  required = false,
  placeholder = "Pilih atau tambah sumber historis",
  searchPlaceholder = "Cari sumber tersimpan atau ketik sumber baru...",
  storedLabel = "Sumber tersimpan pada properti ini",
  addLabel = "sumber",
  emptyMessage = "Tidak ada sumber yang cocok. Ketik minimal 3 karakter untuk menambahkan sumber baru.",
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>();
  const anchorRef = useRef<HTMLDivElement>(null);
  const typedName = search.trim().replace(/\s+/g, " ");
  const sortedOptions = useMemo(
    () =>
      Array.from(new Set(options.map((option) => option.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "id"),
      ),
    [options],
  );
  const visibleOptions = sortedOptions.filter((option) =>
    normalizeSource(option).includes(normalizeSource(search)),
  );
  const canAdd =
    typedName.length >= 3 &&
    typedName.length <= 120 &&
    !sortedOptions.some((option) => normalizeSource(option) === normalizeSource(typedName));

  const openMenu = () => {
    const anchor = anchorRef.current;
    setPortalContainer(anchor?.closest<HTMLElement>('[role="dialog"]') ?? null);
    setPanelWidth(anchor?.getBoundingClientRect().width);
    setSearch("");
    setOpen(true);
  };

  const select = (source: string) => {
    onChange(source);
    setOpen(false);
    setSearch("");
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
            onClick={() => (open ? setOpen(false) : openMenu())}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left text-sm font-medium shadow-xs outline-none transition-colors hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className={cn("min-w-0 truncate", !value && "text-muted-foreground")}>
              {value || placeholder}
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
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            maxLength={120}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
          />
          <CommandList className="max-h-[min(18rem,45vh)] touch-pan-y overscroll-contain overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat sumber...
              </div>
            ) : null}
            {!loading && visibleOptions.length === 0 && !canAdd ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : null}
            {visibleOptions.length > 0 ? (
              <CommandGroup heading={storedLabel}>
                {visibleOptions.map((option) => (
                  <CommandItem key={option} value={option} onSelect={() => select(option)}>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        normalizeSource(value) === normalizeSource(option)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate">{option}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {canAdd ? (
              <CommandGroup heading="Tambah baru">
                <CommandItem
                  value={`add-${typedName}`}
                  onSelect={() => select(typedName)}
                  className="text-primary"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span className="min-w-0 truncate">
                    Tambah {addLabel} “{typedName}”
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
