import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
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
import { useCreateUniversity, useUniversities } from "@/hooks/useUniversities";
import { normalizeUniversityName } from "@/lib/admin-universities";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  propertyId?: string | null;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function UniversityCombobox({
  id,
  value,
  onChange,
  propertyId,
  disabled,
  placeholder = "Ketik atau pilih universitas",
  maxLength = 160,
  ...aria
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [createError, setCreateError] = useState<string | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>();
  const anchorRef = useRef<HTMLDivElement>(null);
  const universities = useUniversities(search, propertyId);
  const create = useCreateUniversity(propertyId);

  useEffect(() => {
    if (!open) setSearch(value);
  }, [open, value]);

  const typedName = search.trim().replace(/\s+/g, " ");
  const sortedOptions = useMemo(
    () =>
      (universities.data?.items ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "id")),
    [universities.data?.items],
  );
  const canAdd =
    typedName.length >= 2 &&
    !sortedOptions.some(
      (option) => normalizeUniversityName(option.name) === normalizeUniversityName(typedName),
    );

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

  const select = (name: string) => {
    setCreateError(null);
    onChange(name);
    setSearch(name);
    setOpen(false);
  };

  const addUniversity = async () => {
    if (!canAdd || create.isPending) return;
    setCreateError(null);
    try {
      const created = await create.mutateAsync({ name: typedName });
      select(created.name);
    } catch {
      setCreateError("Universitas belum dapat ditambahkan. Coba lagi.");
    }
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
              setCreateError(null);
              onChange(next);
              if (!open) setDropdownOpen(true);
            }}
            className="pr-10"
            {...aria}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Buka daftar universitas"
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
              setCreateError(null);
            }}
            placeholder="Cari universitas..."
          />
          <CommandList
            className="max-h-[min(18rem,45vh)] touch-pan-y overscroll-contain overflow-y-auto"
            onWheel={(event) => event.stopPropagation()}
          >
            {universities.isPending ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat daftar...
              </div>
            ) : null}
            {!universities.isPending && sortedOptions.length === 0 && !canAdd ? (
              <CommandEmpty>Belum ada universitas yang sesuai.</CommandEmpty>
            ) : null}
            {sortedOptions.length > 0 ? (
              <CommandGroup heading="Universitas tersimpan">
                {sortedOptions.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.name}
                    onSelect={() => select(option.name)}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        normalizeUniversityName(value) === normalizeUniversityName(option.name)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate">{option.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {canAdd ? (
              <CommandGroup heading="Tambah baru">
                <CommandItem
                  value={`add-${typedName}`}
                  onSelect={() => void addUniversity()}
                  className="text-primary"
                >
                  {create.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="min-w-0 truncate">Tambahkan universitas “{typedName}”</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {createError ? (
              <p className="px-3 pb-3 text-xs text-destructive" role="alert">
                {createError}
              </p>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
