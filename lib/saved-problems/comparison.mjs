export const MIN_PROBLEM_COMPARISON_ITEMS = 2;
export const MAX_PROBLEM_COMPARISON_ITEMS = 4;

export function normalizeProblemComparisonIds(value) {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const ids = [];

  for (const item of values) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function getProblemComparisonSelectionState(value) {
  const ids = normalizeProblemComparisonIds(value);

  if (ids.length < MIN_PROBLEM_COMPARISON_ITEMS) {
    return {
      ids,
      valid: false,
      message: `Problem Card를 ${MIN_PROBLEM_COMPARISON_ITEMS}개 이상 선택하세요.`,
    };
  }

  if (ids.length > MAX_PROBLEM_COMPARISON_ITEMS) {
    return {
      ids,
      valid: false,
      message: `Problem Card는 최대 ${MAX_PROBLEM_COMPARISON_ITEMS}개까지 비교할 수 있습니다.`,
    };
  }

  return { ids, valid: true, message: null };
}
