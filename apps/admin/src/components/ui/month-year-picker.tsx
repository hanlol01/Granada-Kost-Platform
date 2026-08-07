import { CalendarDays, ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

type MonthYearPickerProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
};

function todayYear() {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric" }).format(
      new Date(),
    ),
  );
}

function parseMonth(value: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return { year: todayYear(), month: 1 };
  return { year: Number(match[1]), month: Number(match[2]) };
}

function valueFor(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthYearLabel(value: string) {
  const { year, month } = parseMonth(value);
  return `${MONTHS[month - 1]} ${year}`;
}

export function MonthYearPicker({
  value,
  onChange,
  label = "Pilih bulan tagihan",
  className,
}: MonthYearPickerProps) {
  const selected = parseMonth(value);
  const years = useMemo(() => {
    const current = todayYear();
    const lowest = Math.min(current - 5, selected.year);
    const highest = Math.max(current + 5, selected.year);
    return Array.from({ length: highest - lowest + 1 }, (_, index) => lowest + index);
  }, [selected.year]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`min-h-11 w-full justify-between gap-3 rounded-lg px-3 font-normal ${className ?? ""}`}
          aria-label={label}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{monthYearLabel(value)}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[19rem] space-y-4 p-4" align="start">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Periode tagihan</p>
            <p className="text-xs text-muted-foreground">
              Pilih bulan dan tahun untuk daftar tagihan.
            </p>
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-medium"
            value={selected.year}
            onChange={(event) => onChange(valueFor(Number(event.target.value), selected.month))}
            aria-label="Tahun tagihan"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2" aria-label="Pilih bulan">
          {MONTHS.map((name, index) => {
            const month = index + 1;
            const selectedMonth = month === selected.month;
            return (
              <Button
                key={name}
                type="button"
                variant={selectedMonth ? "default" : "outline"}
                className="h-10 px-2 text-xs"
                onClick={() => onChange(valueFor(selected.year, month))}
              >
                {name.slice(0, 3)}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
