export function unwrapResponsePayload<T>(payload: unknown, unwrapData = true): T {
  if (unwrapData && payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}
