export const IDEA_CANDIDATE_SELECT = [
  "id",
  "user_id",
  "problem_candidate_id",
  "generation_batch_id",
  "title",
  "one_liner",
  "target_user",
  "problem_statement",
  "core_value",
  "first_build_scope",
  "excluded_scope",
  "implementation_difficulty",
  "monetization_hint",
  "first_screen_idea",
  "status",
  "memo",
  "order_index",
  "created_at",
  "updated_at",
].join(", ");

const SOURCE_CANDIDATE_SELECT = [
  "id",
  "user_id",
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
].join(", ");

const SOURCE_EVIDENCE_SELECT = [
  "id",
  "original_text",
  "summary_ko",
  "pain_type",
  "target_user",
  "situation",
  "sentiment_level",
  "intensity_level",
  "source_type",
  "source_url",
  "source_memo",
  "status",
  "order_index",
  "created_at",
].join(", ");

const BATCH_SELECT = [
  "id",
  "problem_candidate_id",
  "model",
  "prompt_version",
  "provider_request_id",
  "generation_input_tokens",
  "generation_output_tokens",
  "created_at",
].join(", ");

export class IdeaSourceError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "IdeaSourceError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? 409;
  }
}

export async function loadIdeaGenerationSource(serviceClient, candidateId, userId) {
  const { data: candidate, error: candidateError } = await serviceClient
    .from("ar_problem_candidates")
    .select(SOURCE_CANDIDATE_SELECT)
    .eq("id", candidateId)
    .eq("user_id", userId)
    .maybeSingle();

  if (candidateError) throw candidateError;
  if (!candidate) {
    throw new IdeaSourceError("candidate_not_found", "Problem Card not found", {
      httpStatus: 404,
    });
  }
  if (candidate.status !== "confirmed") {
    throw new IdeaSourceError(
      "confirmed_problem_card_required",
      "Idea generation requires a confirmed Problem Card",
    );
  }
  if (!Number.isInteger(candidate.evidence_count) || candidate.evidence_count < 1) {
    throw new IdeaSourceError(
      "problem_card_evidence_required",
      "Idea generation requires linked Evidence",
    );
  }

  const { data: rawInput, error: rawInputError } = await serviceClient
    .from("ar_raw_inputs")
    .select("id, user_id, analysis_status")
    .eq("id", candidate.raw_input_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (rawInputError) throw rawInputError;
  if (!rawInput) {
    throw new IdeaSourceError("raw_input_not_found", "Source Raw Input not found", {
      httpStatus: 404,
    });
  }
  if (rawInput.analysis_status !== "completed") {
    throw new IdeaSourceError(
      "completed_analysis_required",
      "Idea generation requires a completed source analysis",
    );
  }

  const evidences = await loadSourceEvidences(serviceClient, candidate, userId, {
    requireConfirmed: true,
    requireExactCount: true,
  });

  return {
    raw_input: rawInput,
    problem_card: candidate,
    evidences,
  };
}

export async function loadIdeaCandidatesForProblemCard(serviceClient, candidateId, userId) {
  const { data: ideas, error: ideaError } = await serviceClient
    .from("ar_idea_candidates")
    .select(IDEA_CANDIDATE_SELECT)
    .eq("problem_candidate_id", candidateId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("order_index", { ascending: true, nullsFirst: false });

  if (ideaError) throw ideaError;
  if (!(ideas ?? []).length) {
    return { ideas: [], batches: [], status_events: [] };
  }

  const batchIds = [...new Set(ideas.map((idea) => idea.generation_batch_id))];
  const ideaIds = ideas.map((idea) => idea.id);

  const [{ data: batches, error: batchError }, { data: statusEvents, error: eventError }] =
    await Promise.all([
      serviceClient
        .from("ar_idea_generation_batches")
        .select(BATCH_SELECT)
        .eq("user_id", userId)
        .in("id", batchIds)
        .order("created_at", { ascending: true }),
      serviceClient
        .from("ar_idea_candidate_status_events")
        .select("id, idea_candidate_id, from_status, to_status, created_at")
        .eq("user_id", userId)
        .in("idea_candidate_id", ideaIds)
        .order("created_at", { ascending: true }),
    ]);

  if (batchError) throw batchError;
  if (eventError) throw eventError;

  return {
    ideas,
    batches: batches ?? [],
    status_events: statusEvents ?? [],
  };
}

export async function loadIdeaBatch(serviceClient, batchId, userId) {
  const [{ data: batch, error: batchError }, { data: ideas, error: ideaError }] =
    await Promise.all([
      serviceClient
        .from("ar_idea_generation_batches")
        .select(BATCH_SELECT)
        .eq("id", batchId)
        .eq("user_id", userId)
        .maybeSingle(),
      serviceClient
        .from("ar_idea_candidates")
        .select(IDEA_CANDIDATE_SELECT)
        .eq("generation_batch_id", batchId)
        .eq("user_id", userId)
        .order("order_index", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);

  if (batchError) throw batchError;
  if (ideaError) throw ideaError;
  return { batch: batch ?? null, ideas: ideas ?? [] };
}

export async function loadIdeaCandidateDetail(serviceClient, ideaId, userId) {
  const { data: idea, error: ideaError } = await serviceClient
    .from("ar_idea_candidates")
    .select(IDEA_CANDIDATE_SELECT)
    .eq("id", ideaId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ideaError) throw ideaError;
  if (!idea) return null;

  const [problemResult, batchResult, eventResult] = await Promise.all([
    serviceClient
      .from("ar_problem_candidates")
      .select(SOURCE_CANDIDATE_SELECT)
      .eq("id", idea.problem_candidate_id)
      .eq("user_id", userId)
      .maybeSingle(),
    serviceClient
      .from("ar_idea_generation_batches")
      .select(BATCH_SELECT)
      .eq("id", idea.generation_batch_id)
      .eq("user_id", userId)
      .maybeSingle(),
    serviceClient
      .from("ar_idea_candidate_status_events")
      .select("id, idea_candidate_id, from_status, to_status, created_at")
      .eq("idea_candidate_id", idea.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (problemResult.error) throw problemResult.error;
  if (batchResult.error) throw batchResult.error;
  if (eventResult.error) throw eventResult.error;

  const problemCard = problemResult.data ?? null;
  const evidences = problemCard
    ? await loadSourceEvidences(serviceClient, problemCard, userId)
    : [];

  return {
    idea,
    problem_card: problemCard,
    evidences,
    generation_batch: batchResult.data ?? null,
    status_events: eventResult.data ?? [],
  };
}

export async function loadIdeaOverview(serviceClient, userId) {
  const { data: ideas, error: ideaError } = await serviceClient
    .from("ar_idea_candidates")
    .select(IDEA_CANDIDATE_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (ideaError) throw ideaError;
  if (!(ideas ?? []).length) return [];

  const candidateIds = [...new Set(ideas.map((idea) => idea.problem_candidate_id))];
  const { data: problemCards, error: candidateError } = await serviceClient
    .from("ar_problem_candidates")
    .select("id, title, summary, status")
    .eq("user_id", userId)
    .in("id", candidateIds);

  if (candidateError) throw candidateError;
  const sourceById = new Map((problemCards ?? []).map((item) => [item.id, item]));

  return ideas.map((idea) => ({
    ...idea,
    problem_card: sourceById.get(idea.problem_candidate_id) ?? null,
  }));
}

async function loadSourceEvidences(
  serviceClient,
  candidate,
  userId,
  { requireConfirmed = false, requireExactCount = false } = {},
) {
  const { data: links, error: linkError } = await serviceClient
    .from("ar_problem_evidence_links")
    .select("pain_evidence_id")
    .eq("problem_candidate_id", candidate.id);

  if (linkError) throw linkError;
  const evidenceIds = [...new Set((links ?? []).map((link) => link.pain_evidence_id))];

  if (requireExactCount && (
    evidenceIds.length < 1 ||
    evidenceIds.length !== candidate.evidence_count ||
    evidenceIds.length !== (links ?? []).length
  )) {
    throw new IdeaSourceError(
      "problem_card_evidence_inconsistent",
      "Problem Card Evidence links are inconsistent",
    );
  }
  if (evidenceIds.length === 0) return [];

  let query = serviceClient
    .from("ar_pain_evidences")
    .select(SOURCE_EVIDENCE_SELECT)
    .eq("raw_input_id", candidate.raw_input_id)
    .eq("user_id", userId)
    .in("id", evidenceIds);

  if (requireConfirmed) query = query.eq("status", "confirmed");
  const { data: evidences, error: evidenceError } = await query
    .order("order_index", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (evidenceError) throw evidenceError;
  if (requireExactCount && (evidences ?? []).length !== evidenceIds.length) {
    throw new IdeaSourceError(
      "problem_card_evidence_inconsistent",
      "Every linked Evidence must remain confirmed and owned by the source user",
    );
  }

  return evidences ?? [];
}