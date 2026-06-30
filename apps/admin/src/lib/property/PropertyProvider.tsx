import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/useAuth";
import type { PropertyScopeRef } from "@granada-kost/domain";

const STORAGE_KEY = "granada.currentPropertyId";

export type PropertyContextValue = {
  currentPropertyId: string | null;
  availableProperties: PropertyScopeRef[];
  setCurrentPropertyId: (id: string) => void;
};

export const PropertyContext = createContext<PropertyContextValue | null>(null);

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function PropertyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const availableProperties = useMemo<PropertyScopeRef[]>(() => {
    if (user?.properties && user.properties.length > 0) return user.properties;
    return (user?.property_ids ?? []).map((id) => ({ id }));
  }, [user]);

  const [currentPropertyId, setCurrentPropertyIdState] = useState<string | null>(null);

  // Resolve initial selection whenever auth changes.
  useEffect(() => {
    if (availableProperties.length === 0) {
      setCurrentPropertyIdState(null);
      writeStored(null);
      return;
    }
    const stored = readStored();
    if (stored && availableProperties.some((p) => p.id === stored)) {
      setCurrentPropertyIdState(stored);
      return;
    }
    const first = availableProperties[0]!.id;
    setCurrentPropertyIdState(first);
    writeStored(first);
  }, [availableProperties]);

  const setCurrentPropertyId = useCallback(
    (id: string) => {
      setCurrentPropertyIdState((prev) => {
        if (prev === id) return prev;
        // Drop queries scoped to the previous property to prevent cache bleed.
        if (prev !== null) {
          queryClient.removeQueries({
            predicate: (q) =>
              Array.isArray(q.queryKey) &&
              q.queryKey.some(
                (segment) =>
                  typeof segment === "object" &&
                  segment !== null &&
                  "propertyId" in (segment as Record<string, unknown>) &&
                  (segment as { propertyId?: string }).propertyId === prev,
              ),
          });
        }
        writeStored(id);
        return id;
      });
    },
    [queryClient],
  );

  const value = useMemo<PropertyContextValue>(
    () => ({ currentPropertyId, availableProperties, setCurrentPropertyId }),
    [currentPropertyId, availableProperties, setCurrentPropertyId],
  );

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}
