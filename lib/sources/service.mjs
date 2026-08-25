import { getEvaluationSampleIds, loadCampaignPool } from "./blind-evaluation.mjs";
import { DISCOVERY_PREFILTER_VERSION, filterDiscoverySignals } from "./discovery-prefilter.mjs";
import { buildSourceAdmissionIndependentAudit } from "./source-admission-audit.mjs";
import { classifySourceAdmission, summarizeSourceAdmissions } from "./source-admission-policy.mjs";

const SOURCE_LOOKUP_CHUNK_SIZE = 150;
const RUN_LOOKUP_CHUNK_SIZE = 150;
export const NEW_SOURCE_ADMISSION_TELEMETRY_VERSION = "new-source-admission-yield-v0.1";

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
  discoverySummary = null,
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

  const newSignals = uniqueSignals.filter(
    (signal) => !existingKeys.has(sourceSignalKey(signal)),
  );

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

  const insertedCount = newSignals.length;
  const duplicateCount = uniqueSignals.length - insertedCount;
  const admissionSummary = discoverySummary ? summarizeSourceAdmissions(uniqueSignals) : null;
  const newAdmissionSummary = discoverySummary ? summarizeSourceAdmissions(newSignals) : null;

  const runUpdate = {
    status: "completed",
    fetched_count: fetchedCount,
    inserted_count: insertedCount,
    duplicate_count: duplicateCount,
    skipped_count: skippedCount,
    completed_at: new Date().toISOString(),
    error_code: null,
    error_message: null,
  };

  if (discoverySummary) {
    Object.assign(runUpdate, {
      discovery_policy_version: DISCOVERY_PREFILTER_VERSION,
      discovery_continue_count: discoverySummary.continue_count,
      discovery_reject_count: discoverySummary.reject_count,
      discovery_reason_counts: discoverySummary.reason_counts,
      admission_candidate_count: admissionSummary.candidate,
      admission_review_count: admissionSummary.review,
      admission_reject_count: admissionSummary.reject,
      new_admission_telemetry_version: NEW_SOURCE_ADMISSION_TELEMETRY_VERSION,
      new_admission_candidate_count: newAdmissionSummary.candidate,
      new_admission_review_count: newAdmissionSummary.review,
      new_admission_reject_count: newAdmissionSummary.reject,
    });
  }

  const { data: run, error: runError } = await serviceClient
    .from("ar_source_ingestion_runs")
    .update(runUpdate)
    .eq("id", runId)
    .select("*")
    .single();
  if (runError) throw runError;

  return {
    run,
    signals: persisted,
    observations,
    admission_summary: admissionSummary,
    new_admission_summary: newAdmissionSummary,
  };
}

export async function persistDiscoveredSourceSignals(serviceClient, {
  runId,
  queryText,
  signals,
  fetchedCount,
  skippedCount,
}) {
  const discovery = filterDiscoverySignals(signals);
  const persisted = await persistSourceSignals(serviceClient, {
    runId,
    queryText,
    signals: discovery.accepted,
    fetchedCount,
    skippedCount,
    discoverySummary: discovery.summary,
  });

  return {
    ...persisted,
    discovery: {
      version: discovery.version,
      summary: discovery.summary,
      rejected: discovery.rejected,
    },
  };
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

export async function listDiscoveryQueryMetrics(serviceClient, { limit = 1000 } = {}) {
  const { data, error } = await serviceClient
    .from("ar_source_ingestion_runs")
    .select("source_platform, query_text, request_metadata, requested_limit, fetched_count, inserted_count, duplicate_count, discovery_continue_count, discovery_reject_count, admission_candidate_count, admission_review_count, admission_reject_count, new_admission_telemetry_version, new_admission_candidate_count, new_admission_review_count, new_admission_reject_count, completed_at")
    .eq("status", "completed")
    .not("discovery_policy_version", "is", null)
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const metricsByKey = new Map();
  for (const run of data ?? []) {
    const queryKey = run.request_metadata?.discovery_query_key ?? `${run.source_platform}:${run.query_text}`;
    const runStart = Number(run.request_metadata?.start ?? run.request_metadata?.discovery_page_start ?? 1);
    const runLimit = Number(run.requested_limit ?? run.request_metadata?.display ?? 50);
    const runFetched = Number(run.fetched_count ?? 0);
    const current = metricsByKey.get(queryKey) ?? {
      query_key: queryKey,
      source_platform: run.source_platform,
      query_text: run.query_text,
      domain: run.request_metadata?.discovery_domain ?? null,
      family: run.request_metadata?.discovery_family ?? null,
      completed_runs: 0,
      fetched_count: 0,
      inserted_count: 0,
      duplicate_count: 0,
      discovery_continue_count: 0,
      discovery_reject_count: 0,
      admission_candidate_count: 0,
      admission_review_count: 0,
      admission_reject_count: 0,
      new_telemetry_runs: 0,
      new_telemetry_fetched_count: 0,
      new_telemetry_continue_count: 0,
      new_telemetry_discovery_reject_count: 0,
      new_telemetry_inserted_count: 0,
      new_telemetry_duplicate_count: 0,
      new_admission_candidate_count: 0,
      new_admission_review_count: 0,
      new_admission_reject_count: 0,
      max_start: Number.isFinite(runStart) ? runStart : 1,
      max_start_fetched_count: runFetched,
      requested_limit: Number.isFinite(runLimit) ? runLimit : 50,
      latest_completed_at: run.completed_at ?? null,
    };

    if (Number.isFinite(runStart) && runStart > current.max_start) {
      current.max_start = runStart;
      current.max_start_fetched_count = runFetched;
      current.requested_limit = Number.isFinite(runLimit) ? runLimit : current.requested_limit;
    }

    current.completed_runs += 1;
    for (const field of [
      "fetched_count",
      "inserted_count",
      "duplicate_count",
      "discovery_continue_count",
      "discovery_reject_count",
      "admission_candidate_count",
      "admission_review_count",
      "admission_reject_count",
    ]) {
      current[field] += Number(run[field] ?? 0);
    }

    if (run.new_admission_telemetry_version === NEW_SOURCE_ADMISSION_TELEMETRY_VERSION) {
      current.new_telemetry_runs += 1;
      current.new_telemetry_fetched_count += Number(run.fetched_count ?? 0);
      current.new_telemetry_continue_count += Number(run.discovery_continue_count ?? 0);
      current.new_telemetry_discovery_reject_count += Number(run.discovery_reject_count ?? 0);
      current.new_telemetry_inserted_count += Number(run.inserted_count ?? 0);
      current.new_telemetry_duplicate_count += Number(run.duplicate_count ?? 0);
      current.new_admission_candidate_count += Number(run.new_admission_candidate_count ?? 0);
      current.new_admission_review_count += Number(run.new_admission_review_count ?? 0);
      current.new_admission_reject_count += Number(run.new_admission_reject_count ?? 0);
    }

    metricsByKey.set(queryKey, current);
  }

  return [...metricsByKey.values()];
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

export async function getSourceAdmissionStats(serviceClient) {
  const operational = await loadBlindSafeOperationalSourceSignals(serviceClient);
  return {
    ...summarizeSourceAdmissions(operational.signals),
    campaign_pool: operational.campaignPool,
    discovery_pool: operational.discoveryPool,
    blind_excluded: operational.blindExcluded,
    eligible: operational.signals.length,
  };
}

export async function listSourceAdmissionQueue(serviceClient, { limit = 100 } = {}) {
  const operational = await loadBlindSafeOperationalSourceSignals(serviceClient);
  return operational.signals
    .map((signal) => ({ ...signal, admission: classifySourceAdmission(signal) }))
    .filter((signal) => signal.admission.decision !== "reject")
    .sort((a, b) => String(b.last_seen_at ?? "").localeCompare(String(a.last_seen_at ?? "")))
    .slice(0, limit);
}

export async function getSourceAdmissionIndependentAudit(serviceClient) {
  const development = await loadBlindSafeCampaignDevelopmentSignals(serviceClient);
  const audit = buildSourceAdmissionIndependentAudit(development.signals);
  return {
    ...audit,
    manifest: {
      ...audit.manifest,
      campaign_pool: development.campaignPool,
      blind_excluded: development.blindExcluded,
    },
  };
}

async function loadSignalsByIds(serviceClient, sourceSignalIds) {
  const signals = [];
  for (let index = 0; index < sourceSignalIds.length; index += SOURCE_LOOKUP_CHUNK_SIZE) {
    const ids = sourceSignalIds.slice(index, index + SOURCE_LOOKUP_CHUNK_SIZE);
    const { data, error } = await serviceClient
      .from("ar_source_signals")
      .select("id, source_platform, canonical_url, author_handle, raw_text, source_metadata, published_at, last_seen_at")
      .in("id", ids);
    if (error) throw error;
    signals.push(...(data ?? []));
  }
  return signals;
}

async function loadDiscoverySignalIds(serviceClient) {
  const { data: runs, error: runError } = await serviceClient
    .from("ar_source_ingestion_runs")
    .select("id")
    .eq("status", "completed")
    .not("discovery_policy_version", "is", null)
    .order("completed_at", { ascending: false })
    .limit(5000);
  if (runError) throw runError;

  const runIds = (runs ?? []).map((row) => row.id);
  const signalIds = new Set();
  for (let index = 0; index < runIds.length; index += RUN_LOOKUP_CHUNK_SIZE) {
    const ids = runIds.slice(index, index + RUN_LOOKUP_CHUNK_SIZE);
    const { data, error } = await serviceClient
      .from("ar_source_signal_observations")
      .select("source_signal_id")
      .in("ingestion_run_id", ids)
      .limit(10000);
    if (error) throw error;
    for (const row of data ?? []) signalIds.add(row.source_signal_id);
  }
  return [...signalIds];
}

async function loadBlindSafeOperationalSourceSignals(serviceClient) {
  const [campaign, evaluationIds, discoverySignalIds] = await Promise.all([
    loadCampaignPool(serviceClient),
    getEvaluationSampleIds(serviceClient),
    loadDiscoverySignalIds(serviceClient),
  ]);
  const eligibleIds = [...new Set([...campaign.signalIds, ...discoverySignalIds])]
    .filter((id) => !evaluationIds.has(id));
  return {
    campaignPool: campaign.signalIds.length,
    discoveryPool: discoverySignalIds.length,
    blindExcluded: evaluationIds.size,
    signals: await loadSignalsByIds(serviceClient, eligibleIds),
  };
}

async function loadBlindSafeCampaignDevelopmentSignals(serviceClient) {
  const [pool, evaluationIds] = await Promise.all([
    loadCampaignPool(serviceClient),
    getEvaluationSampleIds(serviceClient),
  ]);
  const eligibleIds = pool.signalIds.filter((id) => !evaluationIds.has(id));
  return {
    campaignPool: pool.signalIds.length,
    blindExcluded: evaluationIds.size,
    signals: await loadSignalsByIds(serviceClient, eligibleIds),
  };
}
