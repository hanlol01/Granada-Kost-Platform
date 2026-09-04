"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { id as indonesiaLocale } from "date-fns/locale";
import type { Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type HeroUiDatePickerProps = {
  id?: string;
  label?: React.ReactNode;
  ariaLabel?: string;
  value?: string | null;
  onChange: (value: string | undefined) => void;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  validationTarget?: boolean;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function parseCanonicalDate(value?: string | null): Date | undefined {
  const match = DATE_ONLY.exec(value ?? "");
  if (!match) return undefined;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

function toCanonicalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(date?: Date): string {
  if (!date) return "dd/mm/yyyy";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTypedDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseTypedDate(value: string): Date | undefined {
  const match = DISPLAY_DATE.exec(value.trim());
  if (!match) return undefined;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

export function HeroUiDatePicker({
  id,
  label,
  ariaLabel,
  value,
  onChange,
  description,
  error,
  required = false,
  disabled = false,
  minDate,
  maxDate,
  placeholder,
  className,
  triggerClassName,
  validationTarget = false,
}: HeroUiDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(() => {
    const initialSelected = parseCanonicalDate(value);
    return initialSelected ? displayDate(initialSelected) : "";
  });
  const [inputError, setInputError] = React.useState<string | undefined>();
  const selected = parseCanonicalDate(value);
  const minimum = parseCanonicalDate(minDate);
  const maximum = parseCanonicalDate(maxDate);
  const today = new Date();
  const todaySelectable = (!minimum || today >= minimum) && (!maximum || today <= maximum);
  const descriptionId = id && description ? `${id}-description` : undefined;
  const errorId = id && (error || inputError) ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const visibleError = inputError ?? error;
  const disabledDays: Matcher[] = [];
  if (minimum) disabledDays.push({ before: minimum });
  if (maximum) disabledDays.push({ after: maximum });

  React.useEffect(() => {
    const nextSelected = parseCanonicalDate(value);
    setInputValue(nextSelected ? displayDate(nextSelected) : "");
    setInputError(undefined);
  }, [value]);

  const isDateAllowed = (date: Date) =>
    (!minimum || date >= minimum) && (!maximum || date <= maximum);

  const commitInputValue = (rawValue: string): boolean => {
    const nextValue = rawValue.trim();
    if (!nextValue) {
      setInputError(undefined);
      if (value) onChange(undefined);
      return true;
    }

    const date = parseTypedDate(nextValue);
    if (!date) {
      setInputError("Masukkan tanggal valid dengan format dd/mm/yyyy.");
      return false;
    }
    if (!isDateAllowed(date)) {
      setInputError("Tanggal berada di luar rentang yang diizinkan.");
      return false;
    }

    const canonical = toCanonicalDate(date);
    setInputValue(displayDate(date));
    setInputError(undefined);
    if (canonical !== (value ?? "")) onChange(canonical);
    return true;
  };

  const selectDate = (date: Date | undefined) => {
    setInputError(undefined);
    onChange(date ? toCanonicalDate(date) : undefined);
    setOpen(false);
  };

  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium leading-none">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </label>
      ) : null}
      <div className="relative">
        <Input
          id={id}
          type="text"
          value={inputValue}
          placeholder={placeholder ?? "dd/mm/yyyy"}
          disabled={disabled}
          required={required}
          inputMode="numeric"
          autoComplete="off"
          aria-label={ariaLabel}
          aria-invalid={Boolean(visibleError) || undefined}
          aria-describedby={describedBy}
          data-validation-target={validationTarget ? "true" : undefined}
          onChange={(event) => {
            const nextValue = formatTypedDate(event.target.value);
            setInputValue(nextValue);
            setInputError(undefined);
            if (nextValue.length === 10) {
              const date = parseTypedDate(nextValue);
              if (date && isDateAllowed(date)) {
                const canonical = toCanonicalDate(date);
                if (canonical !== (value ?? "")) onChange(canonical);
              }
            }
          }}
          onBlur={() => {
            commitInputValue(inputValue);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitInputValue(inputValue);
            }
          }}
          className={cn(
            "h-11 min-h-11 pl-14",
            visibleError ? "border-destructive focus-visible:ring-destructive/30" : undefined,
            triggerClassName,
          )}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={
                ariaLabel
                  ? `Buka kalender: ${ariaLabel}`
                  : typeof label === "string"
                    ? `Buka kalender: ${label}`
                    : "Buka kalender"
              }
              className={cn(
                "absolute left-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground",
                "transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <CalendarDays className="size-4" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={8} className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={selectDate}
              defaultMonth={selected ?? minimum ?? new Date()}
              disabled={disabledDays.length ? disabledDays : undefined}
              captionLayout="dropdown"
              fromYear={1900}
              toYear={2100}
              locale={indonesiaLocale}
            />
            <div className="flex items-center justify-between border-t p-2">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 px-3"
                disabled={!selected}
                onClick={() => {
                  setInputError(undefined);
                  onChange(undefined);
                }}
              >
                Bersihkan
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 px-3"
                disabled={!todaySelectable}
                onClick={() => selectDate(new Date())}
              >
                Hari ini
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {visibleError ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {visibleError}
        </p>
      ) : null}
    </div>
  );
}
