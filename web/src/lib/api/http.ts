import "server-only";

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

export function apiError(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function internalApiError(): Response {
  return apiError(500, "INTERNAL_ERROR", "The request could not be completed.");
}

export function parsePositiveSqlId(value: string): string | null {
  if (!/^[1-9]\d{0,19}$/.test(value)) return null;

  try {
    const id = BigInt(value);
    const maxUnsignedBigint = BigInt("18446744073709551615");
    return id <= maxUnsignedBigint ? value : null;
  } catch {
    return null;
  }
}

export function parsePagination(
  searchParams: URLSearchParams,
): { value: Pagination } | { error: string } {
  const pageValue = searchParams.get("page");
  const limitValue = searchParams.get("limit");
  const page = pageValue === null ? 1 : Number(pageValue);
  const limit = limitValue === null ? 20 : Number(limitValue);

  if (
    (pageValue !== null && !/^\d+$/.test(pageValue)) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1_000_000_000
  ) {
    return { error: "page must be a positive integer." };
  }

  if (
    (limitValue !== null && !/^\d+$/.test(limitValue)) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return { error: "limit must be an integer between 1 and 100." };
  }

  return { value: { page, limit, offset: (page - 1) * limit } };
}

export function normalizeCount(value: string | number): number | string {
  const count = BigInt(value);
  const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
  return count <= maxSafeInteger ? Number(count) : count.toString();
}

export function countPages(total: number | string, limit: number): number | string {
  const totalCount = BigInt(total);
  const pages = (totalCount + BigInt(limit) - BigInt(1)) / BigInt(limit);
  return pages <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(pages) : pages.toString();
}
