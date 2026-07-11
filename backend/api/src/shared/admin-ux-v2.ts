export const ADMIN_UX_V2_ACCEPT = 'application/vnd.granada.admin-ux.v2+json';

export function acceptsAdminUxV2(value: string | string[] | undefined): boolean {
  const header = Array.isArray(value) ? value.join(',') : value;
  return (
    header
      ?.split(',')
      .map((item) => item.trim().toLowerCase().split(';', 1)[0])
      .includes(ADMIN_UX_V2_ACCEPT) ?? false
  );
}

export function v2List<T>(data: T[], limit: number, offset: number, total: number) {
  return { data, meta: { total, limit, offset } };
}

export function v2Data<T>(data: T) {
  return { data };
}

export function normalizePagination(input: { limit?: number; offset?: number }) {
  return {
    limit: Math.min(Math.max(input.limit ?? 20, 1), 100),
    offset: Math.max(input.offset ?? 0, 0),
  };
}
