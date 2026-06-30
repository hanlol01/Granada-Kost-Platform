import { useContext } from "react";
import { PropertyContext, type PropertyContextValue } from "./PropertyProvider";

export function useProperty(): PropertyContextValue {
  const ctx = useContext(PropertyContext);
  if (!ctx) {
    throw new Error("useProperty must be used inside <PropertyProvider>.");
  }
  return ctx;
}
