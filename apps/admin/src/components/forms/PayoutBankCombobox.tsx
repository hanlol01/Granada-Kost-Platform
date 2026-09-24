import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

function normalizeBankName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

/**
 * Searchable bank selector matching the tenant-onboarding University control.
 * A newly typed bank becomes the draft value immediately and is persisted with
 * the Owner profile; the refreshed Owner list then makes it reusable later.
 */
export function PayoutBankCombobox({
  id,
  value,
  options,
  onChange,
  disabled,
  placeholder = "Ketik atau pilih nama bank",
  maxLength = 120,
  ...aria
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>();
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setSearch(value);
  }, [open, value]);

  const typedName = search.trim().replace(/\s+/g, " ");
  const sortedOptions = useMemo(
    () => [...options].sort((left, right) => left.localeCompare(right, "id")),
    [options],
  );
  const visibleOptions = useMemo(() => {
    const normalizedSearch = normalizeBankName(search);
    if (!normalizedSearch) return sortedOptions;
    return sortedOptions.filter((option) => normalizeBankName(option).includes(normalizedSearch));
  }, [search, sortedOptions]);
  const canAdd =
    typedName.length >= 2 &&
    !sortedOptions.some((option) => normalizeBankName(option) === normalizeBankName(typedName));

  const prepareDropdown = () => {
    const anchor = anchorRef.current;
    setPortalContainer(anchor?.closest<HTMLElement>('[role="dialog"]') ?? null);
    setPanelWidth(anchor?.getBoundingClientRect().width);
  };

  const setDropdownOpen = (next: boolean) => {
    if (disabled) return;
    if (next) prepareDropdown();
    setOpen(next);
  };

  const select = (bankName: string) => {
    onChange(bankName);
    setSearch(bankName);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setDropdownOpen}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative">
          <Input
            id={id}
            value={value}
            maxLength={maxLength}
            disabled={disabled}
            placeholder={placeholder}
            onFocus={() => setDropdownOpen(true)}
            onChange={(event) => {
              const next = event.target.value;
              setSearch(next);
              onChange(next);
              if (!open) setDropdownOpen(true);
            }}
            className="pr-10"
            {...aria}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Buka daftar nama bank"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setDropdownOpen(!open)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        portalContainer={portalContainer}
        onOpenAutoFocus={(event) => event.preventDefault()}
        style={{ width: panelWidth, maxWidth: "calc(100vw - 2rem)" }}
        className="min-w-0 p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={(next) => {
              setSearch(next);
              onChange(next);
            }}
            placeholder="Cari nama bank..."
          />
          <CommandList className="max-h-[min(18rem,45vh)] touch-pan-y overscroll-contain overflow-y-auto">
            {visibleOptions.length === 0 && !canAdd ? (
              <CommandEmpty>Belum ada nama bank yang sesuai.</CommandEmpty>
            ) : null}
            {visibleOptions.length > 0 ? (
              <CommandGroup heading="Bank tersimpan">
                {visibleOptions.map((option) => (
                  <CommandItem key={option} value={option} onSelect={() => select(option)}>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        normalizeBankName(value) === normalizeBankName(option)
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
                  <span className="min-w-0 truncate">Tambahkan nama bank “{typedName}”</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
