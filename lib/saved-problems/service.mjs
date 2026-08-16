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
  { status = "active" } = {},
) {
  let query = serviceClient
    .from("ar_saved_problem_cards")
    .select(SAVED_PROBLEM_SELECT)
    .eq("user_id", userId);

  if (status !== "all") query = query.eq("status", status);

  const { data: savedProblems, error: savedError } = await query
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (savedError) throw savedError;
  if (!(savedProblems ?? []).length) return [];

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
