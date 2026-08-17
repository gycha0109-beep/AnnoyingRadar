export async function loadProblemAlternativeNotes(serviceClient, problemCandidateId, userId) {
  const { data, error } = await serviceClient
    .from("ar_problem_alternative_notes")
    .select("id, problem_candidate_id, user_id, kind, name, url, note, created_at, updated_at")
    .eq("problem_candidate_id", problemCandidateId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function loadProblemAlternativeNote(
  serviceClient,
  problemCandidateId,
  noteId,
  userId,
) {
  const { data, error } = await serviceClient
    .from("ar_problem_alternative_notes")
    .select("id, problem_candidate_id, user_id, kind, name, url, note, created_at, updated_at")
    .eq("id", noteId)
    .eq("problem_candidate_id", problemCandidateId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}
