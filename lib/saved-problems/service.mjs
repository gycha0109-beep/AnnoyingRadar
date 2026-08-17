import { summarizeSavedProblemCategories } from "./category.mjs";

export const SAVED_PROBLEM_SELECT = [
  "problem_candidate_id",
  "user_id",
  "category",
  "memo",
  "status",
  "created_at",
  "updated_at",
].join(", ");

const PROBLEM_CARD_SELECT = [
  "id",
  "raw_input_id",
  "title",
  "summary",
  "target_user",
  "situation",
  "evidence_count",
  "intensity_level",
  "repeat_pattern_level",
  "clarity_level",
  "status",
  "created_at",
  "updated_at",
].join(", ");

export async function loadSavedProblemByCandidate(serviceClient, candidateId, userId) {
  const { data, error } = await serviceClient
    .from("ar_saved_problem_cards")
    .select(SAVED_PROBLEM_SELECT)
    .eq("problem_candidate_id", candidateId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function loadSavedProblemOverview(
  serviceClient,
  userId,
  { status = "active", category = null } = {},
) {
  let query = serviceClient
    .from("ar_saved_problem_cards")
    .select(SAVED_PROBLEM_SELECT)
    .eq("user_id", userId);

  if (status !== "all") query = query.eq("status", status);
  if (category) query = query.eq("category", category);

  const { data: savedProblems, error: savedError } = await query
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (savedError) throw savedError;
  if (!(savedProblems ?? []).length) return [];

  return attachProblemCards(serviceClient, userId, savedProblems);
}

export async function loadSavedProblemCategoryOverview(serviceClient, userId) {
  const { data, error } = await serviceClient
    .from("ar_saved_problem_cards")
    .select("category, status")
    .eq("user_id", userId);

  if (error) throw error;
  return summarizeSavedProblemCategories(data ?? []);
}

export async function loadProblemComparisonCatalog(serviceClient, userId) {
  const { data: problemCards, error } = await serviceClient
    .from("ar_problem_candidates")
    .select(PROBLEM_CARD_SELECT)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return attachSavedProblemMetadata(serviceClient, userId, problemCards ?? []);
}

export async function loadProblemComparison(serviceClient, userId, candidateIds) {
  if (!candidateIds.length) return [];

  const { data: problemCards, error } = await serviceClient
    .from("ar_problem_candidates")
    .select(PROBLEM_CARD_SELECT)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .in("id", candidateIds);

  if (error) throw error;

  const attached = await attachSavedProblemMetadata(serviceClient, userId, problemCards ?? []);
  const byId = new Map(attached.map((item) => [item.problem_candidate_id, item]));
  return candidateIds.map((id) => byId.get(id)).filter(Boolean);
}

async function attachProblemCards(serviceClient, userId, savedProblems) {
  const candidateIds = savedProblems.map((item) => item.problem_candidate_id);
  const { data: problemCards, error: problemError } = await serviceClient
    .from("ar_problem_candidates")
    .select(PROBLEM_CARD_SELECT)
    .eq("user_id", userId)
    .in("id", candidateIds);

  if (problemError) throw problemError;
  const problemById = new Map((problemCards ?? []).map((item) => [item.id, item]));

  return savedProblems.map((savedProblem) => ({
    ...savedProblem,
    problem_card: problemById.get(savedProblem.problem_candidate_id) ?? null,
  }));
}

async function attachSavedProblemMetadata(serviceClient, userId, problemCards) {
  if (!problemCards.length) return [];

  const candidateIds = problemCards.map((item) => item.id);
  const { data: savedProblems, error } = await serviceClient
    .from("ar_saved_problem_cards")
    .select(SAVED_PROBLEM_SELECT)
    .eq("user_id", userId)
    .in("problem_candidate_id", candidateIds);

  if (error) throw error;
  const savedById = new Map((savedProblems ?? []).map((item) => [item.problem_candidate_id, item]));

  return problemCards.map((problemCard) => ({
    problem_candidate_id: problemCard.id,
    problem_card: problemCard,
    saved_problem: savedById.get(problemCard.id) ?? null,
  }));
}
