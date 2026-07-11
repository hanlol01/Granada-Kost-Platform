import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatIDRInput, parseIDR } from "@/lib/format";

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (value: number) => void;
  error?: boolean;
};

/** Controlled integer Rupiah input. The API only receives a non-negative integer. */
export function CurrencyInput({ value, onValueChange, error = false, ...props }: Props) {
  const [text, setText] = useState(() => formatIDRInput(value));

  useEffect(() => {
    setText(formatIDRInput(value));
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
        Rp
      </span>
      <Input
        {...props}
        inputMode="numeric"
        className={`pl-9 ${error ? "border-destructive focus-visible:ring-destructive" : ""} ${props.className ?? ""}`}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          const parsed = parseIDR(next);
          setText(next);
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
    </div>
  );
}
