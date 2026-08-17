export const MAX_SAVED_PROBLEM_CATEGORY_LENGTH = 120;

export function normalizeSavedProblemCategoryFilter(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim();
  if (!normalized || normalized.length > MAX_SAVED_PROBLEM_CATEGORY_LENGTH) return null;
  return normalized;
}

export function savedProblemLibraryHref({ status = "active", category = null } = {}) {
  const params = new URLSearchParams();
  if (status === "archived") params.set("status", "archived");

  const normalizedCategory = normalizeSavedProblemCategoryFilter(category);
  if (normalizedCategory) params.set("category", normalizedCategory);

  const query = params.toString();
  return query ? `/problems?${query}` : "/problems";
}

export function summarizeSavedProblemCategories(rows) {
  const counts = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const category = normalizeSavedProblemCategoryFilter(row?.category);
    if (!category) continue;

    const current = counts.get(category) ?? {
      category,
      total_count: 0,
      active_count: 0,
      archived_count: 0,
    };

    current.total_count += 1;
    if (row?.status === "active") current.active_count += 1;
    if (row?.status === "archived") current.archived_count += 1;
    counts.set(category, current);
  }

  return [...counts.values()].sort((left, right) => stableCompare(left.category, right.category));
}

function stableCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
