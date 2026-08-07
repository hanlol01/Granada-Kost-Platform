"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { id as indonesiaLocale } from "date-fns/locale";
import type { Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

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
}: HeroUiDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseCanonicalDate(value);
  const minimum = parseCanonicalDate(minDate);
  const maximum = parseCanonicalDate(maxDate);
  const today = new Date();
  const todaySelectable = (!minimum || today >= minimum) && (!maximum || today <= maximum);
  const descriptionId = id && (description || error) ? `${id}-description` : undefined;
  const disabledDays: Matcher[] = [];
  if (minimum) disabledDays.push({ before: minimum });
  if (maximum) disabledDays.push({ after: maximum });

  const selectDate = (date: Date | undefined) => {
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={descriptionId}
            className={cn(
              "flex min-h-11 w-full items-center rounded-md border bg-background px-3 text-left text-sm shadow-sm transition-colors",
              "hover:border-foreground/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
              error ? "border-destructive focus-visible:ring-destructive/30" : "border-input",
              triggerClassName,
            )}
          >
            <CalendarDays
              className="mr-2 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className={cn("flex-1", selected ? "text-foreground" : "text-muted-foreground")}>
              {selected ? displayDate(selected) : (placeholder ?? "dd/mm/yyyy")}
            </span>
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
              onClick={() => onChange(undefined)}
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
      {description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={descriptionId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
