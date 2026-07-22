export const CANDIDATE_SELECT = [
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
  "discard_reason",
  "order_index",
  "created_at",
  "updated_at",
].join(", ");

export const CANDIDATE_EVIDENCE_SELECT = [
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

export async function loadCandidateReview(serviceClient, rawInputId, userId) {
  const { data: candidates, error: candidateError } = await serviceClient
    .from("ar_problem_candidates")
    .select(CANDIDATE_SELECT)
    .eq("raw_input_id", rawInputId)
    .eq("user_id", userId)
    .neq("status", "discarded")
    .order("order_index", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (candidateError) throw candidateError;
  if (!candidates?.length) return [];

  const candidateIds = candidates.map((candidate) => candidate.id);
  const { data: links, error: linkError } = await serviceClient
    .from("ar_problem_evidence_links")
    .select("problem_candidate_id, pain_evidence_id")
    .in("problem_candidate_id", candidateIds);

  if (linkError) throw linkError;

  const evidenceIds = [...new Set((links ?? []).map((link) => link.pain_evidence_id))];
  let evidences = [];
  if (evidenceIds.length > 0) {
    const { data, error: evidenceError } = await serviceClient
      .from("ar_pain_evidences")
      .select(CANDIDATE_EVIDENCE_SELECT)
      .eq("raw_input_id", rawInputId)
      .eq("user_id", userId)
      .in("id", evidenceIds)
      .order("order_index", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (evidenceError) throw evidenceError;
    evidences = data ?? [];
  }

  const evidenceById = new Map(evidences.map((evidence) => [evidence.id, evidence]));
  const evidenceIdsByCandidate = new Map();
  for (const link of links ?? []) {
    const current = evidenceIdsByCandidate.get(link.problem_candidate_id) ?? [];
    current.push(link.pain_evidence_id);
    evidenceIdsByCandidate.set(link.problem_candidate_id, current);
  }

  return candidates.map((candidate) => ({
    ...candidate,
    evidences: (evidenceIdsByCandidate.get(candidate.id) ?? [])
      .map((id) => evidenceById.get(id))
      .filter(Boolean),
  }));
}

export function groupingMetadata(rawInput) {
  return {
    model: rawInput.grouping_model ?? null,
    prompt_version: rawInput.grouping_prompt_version ?? null,
    provider_request_id: rawInput.grouping_provider_request_id ?? null,
    error_code: rawInput.grouping_error_code ?? null,
    started_at: rawInput.grouping_started_at ?? null,
    completed_at: rawInput.grouping_completed_at ?? null,
    usage: {
      input_tokens: rawInput.grouping_input_tokens ?? null,
      output_tokens: rawInput.grouping_output_tokens ?? null,
    },
  };
}
