import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatIDRInput, parseIDR } from "@/lib/format";

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (value: number) => void;
  error?: boolean;
  /** Format thousands separators as the user types, matching the onboarding Rupiah field. */
  formatOnChange?: boolean;
  /** Render a trailing clear affordance that resets the amount to zero. */
  onClear?: () => void;
  clearLabel?: string;
};

/** Controlled integer Rupiah input. The API only receives a non-negative integer. */
export function CurrencyInput({
  value,
  onValueChange,
  error = false,
  formatOnChange = false,
  onClear,
  clearLabel = "Hapus nominal",
  ...props
}: Props) {
  const [text, setText] = useState(() => formatIDRInput(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(formatIDRInput(value));
  }, [value]);

  const input = (
    <Input
      {...props}
      ref={inputRef}
      inputMode="numeric"
      className={
        onClear
          ? `h-11 min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 ${props.className ?? ""}`
          : `pl-9 ${error ? "border-destructive focus-visible:ring-destructive" : ""} ${props.className ?? ""}`
      }
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        const parsed = parseIDR(next);
        setText(formatOnChange && parsed !== null ? formatIDRInput(parsed) : next);
        if (parsed !== null) onValueChange(parsed);
      }}
      onBlur={(event) => {
        const parsed = parseIDR(event.target.value);
        const normalized = parsed ?? value;
        setText(formatIDRInput(normalized));
        if (parsed !== null) onValueChange(parsed);
        props.onBlur?.(event);
      }}
    />
  );

  if (!onClear) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
          Rp
        </span>
        {input}
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-11 overflow-hidden rounded-md border bg-background shadow-xs transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 ${error ? "border-destructive focus-within:ring-destructive/25" : "border-input"}`}
    >
      <span className="flex items-center border-r bg-muted px-3 text-sm font-medium text-muted-foreground">
        Rp
      </span>
      {input}
      <button
        type="button"
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border-l border-destructive/20 text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50"
        onClick={() => {
          setText(formatIDRInput(0));
          onValueChange(0);
          onClear();
          requestAnimationFrame(() => {
            const current = inputRef.current;
            if (!current) return;
            current.focus();
            current.setSelectionRange(current.value.length, current.value.length);
          });
        }}
        disabled={props.disabled}
        aria-label={clearLabel}
        title={clearLabel}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
