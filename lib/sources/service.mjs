function sourceSignalKey(signal) {
  return `${signal.source_platform}\u0000${signal.external_content_id}`;
}

export async function createSourceIngestionRun(serviceClient, {
  sourcePlatform,
  input,
  curatorUserId,
}) {
  const { data, error } = await serviceClient
    .from("ar_source_ingestion_runs")
    .insert({
      source_platform: sourcePlatform,
      query_text: input.q,
      search_type: input.search_type,
      search_mode: input.search_mode,
      since_at: input.since,
      until_at: input.until,
      requested_limit: input.limit,
      request_metadata: input.request_metadata ?? {},
      status: "running",
      created_by_curator_user_id: curatorUserId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function failSourceIngestionRun(serviceClient, runId, error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error?.code === "string" ? error.code : "source_ingestion_failed";
  const { error: updateError } = await serviceClient
    .from("ar_source_ingestion_runs")
    .update({
      status: "failed",
      error_code: code.slice(0, 160),
      error_message: message.slice(0, 2000),
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (updateError) console.error(updateError);
}

export async function persistSourceSignals(serviceClient, {
  runId,
  queryText,
  signals,
  fetchedCount,
  skippedCount,
}) {
  const uniqueByIdentity = new Map();
  for (const signal of signals) uniqueByIdentity.set(sourceSignalKey(signal), signal);
  const uniqueSignals = [...uniqueByIdentity.values()];

  let existingKeys = new Set();
  if (uniqueSignals.length > 0) {
    const platforms = [...new Set(uniqueSignals.map((signal) => signal.source_platform))];
    const externalIds = [...new Set(uniqueSignals.map((signal) => signal.external_content_id))];
    const { data: existing, error } = await serviceClient
      .from("ar_source_signals")
      .select("source_platform, external_content_id")
      .in("source_platform", platforms)
      .in("external_content_id", externalIds);
    if (error) throw error;
    existingKeys = new Set((existing ?? []).map(sourceSignalKey));
  }

  const seenAt = new Date().toISOString();
  let persisted = [];
  if (uniqueSignals.length > 0) {
    const rows = uniqueSignals.map((signal) => ({
      ...signal,
      last_seen_at: seenAt,
    }));
    const { data, error } = await serviceClient
      .from("ar_source_signals")
      .upsert(rows, { onConflict: "source_platform,external_content_id" })
      .select("*");
    if (error) throw error;
    persisted = data ?? [];
  }

  const persistedByIdentity = new Map(persisted.map((row) => [sourceSignalKey(row), row]));
  const observations = uniqueSignals
    .map((signal, rankIndex) => {
      const persistedSignal = persistedByIdentity.get(sourceSignalKey(signal));
      if (!persistedSignal?.id) return null;
      return {
        ingestion_run_id: runId,
        source_signal_id: persistedSignal.id,
        query_text: queryText,
        rank_index: rankIndex,
        observed_at: seenAt,
      };
    })
    .filter(Boolean);

  if (observations.length > 0) {
    const { error } = await serviceClient
      .from("ar_source_signal_observations")
      .insert(observations);
    if (error) throw error;
  }

  const insertedCount = uniqueSignals.filter(
    (signal) => !existingKeys.has(sourceSignalKey(signal)),
  ).length;
  const duplicateCount = uniqueSignals.length - insertedCount;

  const { data: run, error: runError } = await serviceClient
    .from("ar_source_ingestion_runs")
    .update({
      status: "completed",
      fetched_count: fetchedCount,
      inserted_count: insertedCount,
      duplicate_count: duplicateCount,
      skipped_count: skippedCount,
      completed_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq("id", runId)
    .select("*")
    .single();
  if (runError) throw runError;

  return { run, signals: persisted, observations };
}

export async function listRecentSourceIngestionRuns(serviceClient, { limit = 20 } = {}) {
  const { data, error } = await serviceClient
    .from("ar_source_ingestion_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listRecentSourceSignals(serviceClient, { limit = 30 } = {}) {
  const { data, error } = await serviceClient
    .from("ar_source_signals")
    .select("id, source_platform, external_content_id, canonical_url, author_handle, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, first_seen_at, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
