export const PUBLIC_CATEGORY_CHIPS = Object.freeze([
  "배달",
  "취업",
  "운동",
  "금융",
  "쇼핑",
  "여행",
]);

const RULES = Object.freeze({
  배달: Object.freeze({
    categoryPrefixes: Object.freeze(["delivery_", "food_delivery_"]),
    searchTerms: Object.freeze(["배달", "최소주문", "배달비"]),
  }),
  취업: Object.freeze({
    categoryPrefixes: Object.freeze(["job_", "career_", "employment_"]),
    searchTerms: Object.freeze(["취업", "채용", "면접", "구직"]),
  }),
  운동: Object.freeze({
    categoryPrefixes: Object.freeze(["fitness_", "gym_", "exercise_"]),
    searchTerms: Object.freeze(["헬스장", "운동", "피트니스"]),
  }),
  금융: Object.freeze({
    categoryPrefixes: Object.freeze(["finance_", "banking_", "payment_"]),
    searchTerms: Object.freeze(["금융", "은행", "결제", "송금"]),
  }),
  쇼핑: Object.freeze({
    categoryPrefixes: Object.freeze(["shopping_", "commerce_", "ecommerce_"]),
    searchTerms: Object.freeze(["쇼핑", "구매", "배송", "주문"]),
  }),
  여행: Object.freeze({
    categoryPrefixes: Object.freeze(["travel_", "lodging_", "hotel_"]),
    searchTerms: Object.freeze(["여행", "숙소", "호텔", "예약"]),
  }),
});

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function publicText(problem) {
  return normalize([problem?.title, problem?.summary, problem?.category].filter(Boolean).join(" "));
}

export function buildPublicCategoryOrFilter(category) {
  const label = String(category ?? "").trim();
  const rule = RULES[label];
  if (!rule) return null;

  const clauses = [];
  for (const prefix of rule.categoryPrefixes) clauses.push(`category.ilike.${prefix}%`);
  for (const term of rule.searchTerms) clauses.push(`search_text.ilike.%${term}%`);
  return clauses.join(",");
}

export function matchesPublicCategory(problem, category) {
  const label = String(category ?? "").trim();
  if (!label) return true;
  const rule = RULES[label];
  if (!rule) return normalize(problem?.category) === normalize(label);

  const categoryValue = normalize(problem?.category);
  const text = publicText(problem);
  return rule.categoryPrefixes.some((prefix) => categoryValue.startsWith(prefix))
    || rule.searchTerms.some((term) => text.includes(normalize(term)));
}

export function publicCategoryLabel(problem) {
  for (const label of PUBLIC_CATEGORY_CHIPS) {
    if (matchesPublicCategory(problem, label)) return label;
  }
  return String(problem?.category ?? "").trim() || null;
}

export function isPublicCategoryVocabulary(value) {
  return PUBLIC_CATEGORY_CHIPS.includes(String(value ?? "").trim());
}
