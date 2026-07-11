import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PropertyScopeRef } from "@granada-kost/domain";
import { useAuth } from "@/lib/auth/useAuth";

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
  const currentPropertyRef = useRef<string | null>(null);
  const accountRef = useRef<string | null>(null);
  const [currentPropertyId, setCurrentPropertyIdState] = useState<string | null>(null);

  const availableProperties = useMemo<PropertyScopeRef[]>(() => {
    if (user?.properties && user.properties.length > 0) return user.properties;
    return (user?.property_ids ?? user?.propertyIds ?? []).map((id) => ({ id }));
  }, [user]);

  const discardScopedCache = useCallback(() => {
    // Cancel first so an in-flight request cannot repopulate the old scope.
    void queryClient.cancelQueries();
    queryClient.removeQueries();
  }, [queryClient]);

  const commitProperty = useCallback(
    (nextPropertyId: string | null) => {
      const previousPropertyId = currentPropertyRef.current;
      if (previousPropertyId === nextPropertyId) return;

      if (previousPropertyId !== null) discardScopedCache();
      currentPropertyRef.current = nextPropertyId;
      setCurrentPropertyIdState(nextPropertyId);
      writeStored(nextPropertyId);
    },
    [discardScopedCache],
  );

  // An authenticated account transition must never reuse another account's cache,
  // even if both accounts happen to share a property id.
  useEffect(() => {
    const nextAccountId = user?.id ?? null;
    if (accountRef.current && accountRef.current !== nextAccountId) discardScopedCache();
    accountRef.current = nextAccountId;
  }, [discardScopedCache, user?.id]);

  // Resolve initial selection whenever auth scope changes.
  useEffect(() => {
    if (availableProperties.length === 0) {
      commitProperty(null);
      return;
    }

    const stored = readStored();
    const nextPropertyId =
      stored && availableProperties.some((property) => property.id === stored)
        ? stored
        : availableProperties[0]!.id;
    commitProperty(nextPropertyId);
  }, [availableProperties, commitProperty]);

  const setCurrentPropertyId = useCallback(
    (id: string) => {
      if (!availableProperties.some((property) => property.id === id)) return;
      commitProperty(id);
    },
    [availableProperties, commitProperty],
  );

  const value = useMemo<PropertyContextValue>(
    () => ({ currentPropertyId, availableProperties, setCurrentPropertyId }),
    [currentPropertyId, availableProperties, setCurrentPropertyId],
  );

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}
