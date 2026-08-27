import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessSourceFormationForCurator,
  SourceFormationAssessmentError,
  SOURCE_FORMATION_ASSESSMENT_VERSION,
} from "../lib/sources/source-formation-service.mjs";

const SIGNAL_ID = "11111111-1111-4111-8111-111111111111";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function candidateOutcome(overrides = {}) {
  return {
    id: "outcome-1",
    outcome_schema_version: "source-full-context-outcome-v0.1",
    batch_version: "test-batch-v0.1",
    status: "resolved",
    decision: "candidate",
    reason_codes: ["full_context_first_hand_external_friction"],
    evaluated_at: "2026-08-27T00:00:00.000Z",
    created_at: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

function sourceRow() {
  return {
    id: SIGNAL_ID,
    source_platform: "web_search",
    canonical_url: "https://example.com/post/1",
    raw_text: "검색 snippet",
    published_at: "2026-08-01T00:00:00.000Z",
    source_origin_kind: "external_web",
    source_origin_host: "example.com",
    source_origin_classifier_version: "source-origin-v0.1",
  };
}

function resolvedContext() {
  return {
    status: "resolved",
    title: "환불 처리 지연 후기",
    content_text: "환불 처리가 계속 지연되어 고객센터에 여러 번 연락했고 해결까지 시간이 오래 걸렸습니다.",
    content_hash: "a".repeat(64),
    original_char_count: 49,
    content_scope: "full_post",
    extraction_scope: "article_element",
    truncated: false,
  };
}

function formationSemantic(overrides = {}) {
  return {
    problem_claim: "yes",
    experience_actor: "self",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    source_origin: "original",
    friction_responsibility: "external_service_or_product",
    evidence_quote: "환불 처리가 계속 지연되어 고객센터에 여러 번 연락했고 해결까지 시간이 오래 걸렸습니다.",
    problem_mechanism_proposal: "refund processing delay",
    incident_summary_proposal: "one refund was delayed and required repeated support contacts",
    prompt_version: "source-problem-formation-semantic-v0.1",
    provider: "openai",
    model: "test-model",
    provider_request_id: "must-not-leak",
    ...overrides,
  };
}

function createFakeClient({
  blind = false,
  outcomes = [candidateOutcome()],
  incidentLinked = false,
  publicEvidenceLinked = false,
  source = sourceRow(),
} = {}) {
  const trace = [];
  const tableData = {
    ar_source_signals: [source],
    ar_source_signal_evaluation_samples: blind ? [{ source_signal_id: SIGNAL_ID }] : [],
    ar_source_full_context_resolution_outcomes: outcomes,
    ar_source_incident_links: incidentLinked ? [{ source_signal_id: SIGNAL_ID }] : [],
    ar_public_problem_evidence_snapshots: publicEvidenceLinked ? [{ source_signal_id: SIGNAL_ID }] : [],
  };

  function builder(table) {
    const state = { table, select: null, eq: [], order: null, limit: null };
    const api = {
      select(value) { state.select = value; trace.push([table, "select", value]); return api; },
      eq(key, value) { state.eq.push([key, value]); trace.push([table, "eq", key, value]); return api; },
      order(key, options) { state.order = [key, options]; trace.push([table, "order", key]); return api; },
      limit(value) { state.limit = value; trace.push([table, "limit", value]); return api; },
      async maybeSingle() {
        const rows = resolveRows();
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = resolveRows();
        return rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: new Error(`missing row in ${table}`) };
      },
      then(resolve, reject) {
        return Promise.resolve({ data: resolveRows(), error: null }).then(resolve, reject);
      },
    };
    function resolveRows() {
      let rows = [...(tableData[table] ?? [])];
      for (const [key, value] of state.eq) rows = rows.filter((row) => row[key] === value);
      if (state.order) {
        const [key, options] = state.order;
        rows.sort((left, right) => String(left[key] ?? "").localeCompare(String(right[key] ?? "")) * (options?.ascending === false ? -1 : 1));
      }
      if (state.limit != null) rows = rows.slice(0, state.limit);
      return rows;
    }
    return api;
  }

  return {
    trace,
    from(table) { trace.push([table, "from"]); return builder(table); },
  };
}

async function assertAssessmentError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof SourceFormationAssessmentError);
    assert.equal(error.code, code);
    return true;
  });
}

test("15.9M blocks Blind members before durable outcome or URL/body access", async () => {
  const client = createFakeClient({ blind: true });
  let fetchContextCalls = 0;
  await assertAssessmentError(
    assessSourceFormationForCurator(client, {
      signalId: SIGNAL_ID,
      fetchContext: async () => { fetchContextCalls += 1; return resolvedContext(); },
      judgeContext: async () => formationSemantic(),
    }),
    "source_formation_blind_member_blocked",
  );
  assert.equal(fetchContextCalls, 0);
  assert.equal(client.trace.some(([table]) => table === "ar_source_full_context_resolution_outcomes"), false);
  assert.equal(client.trace.some(([, action, selection]) => action === "select" && String(selection).includes("canonical_url")), false);
});

test("15.9M requires exactly one resolved durable Candidate before source routing or model work", async () => {
  for (const [outcomes, expectedCode] of [
    [[], "source_formation_durable_outcome_required"],
    [[candidateOutcome(), candidateOutcome({ id: "outcome-2", created_at: "2026-08-28T00:00:00.000Z" })], "source_formation_durable_outcome_ambiguous"],
    [[candidateOutcome({ decision: "reject", reason_codes: ["full_context_no_problem_claim"] })], "source_formation_candidate_required"],
    [[candidateOutcome({ status: "unresolved", decision: "review", reason_codes: ["source_full_context_provider_incomplete"] })], "source_formation_candidate_required"],
  ]) {
    const client = createFakeClient({ outcomes });
    let fetchContextCalls = 0;
    await assertAssessmentError(
      assessSourceFormationForCurator(client, {
        signalId: SIGNAL_ID,
        fetchContext: async () => { fetchContextCalls += 1; return resolvedContext(); },
        judgeContext: async () => formationSemantic(),
      }),
      expectedCode,
    );
    assert.equal(fetchContextCalls, 0);
    assert.equal(client.trace.some(([, action, selection]) => action === "select" && String(selection).includes("canonical_url")), false);
  }
});

test("15.9M refuses to re-assess Sources that already have downstream authority", async () => {
  for (const options of [{ incidentLinked: true }, { publicEvidenceLinked: true }]) {
    const client = createFakeClient(options);
    let fetchContextCalls = 0;
    await assertAssessmentError(
      assessSourceFormationForCurator(client, {
        signalId: SIGNAL_ID,
        fetchContext: async () => { fetchContextCalls += 1; return resolvedContext(); },
        judgeContext: async () => formationSemantic(),
      }),
      "source_formation_downstream_assignment_exists",
    );
    assert.equal(fetchContextCalls, 0);
  }
});

test("15.9M runs v0.2 Formation only for an admitted non-Blind unassigned Candidate and sanitizes transport identity", async () => {
  const client = createFakeClient();
  let sourcePlatform = null;
  const assessment = await assessSourceFormationForCurator(client, {
    signalId: SIGNAL_ID,
    fetchContext: async () => resolvedContext(),
    judgeContext: async (input) => {
      sourcePlatform = input.sourcePlatform;
      return formationSemantic();
    },
  });

  assert.equal(SOURCE_FORMATION_ASSESSMENT_VERSION, "source-formation-assessment-v0.1");
  assert.equal(sourcePlatform, "external_web");
  assert.equal(assessment.authority, "curator_read_only_formation_assessment_not_persistence");
  assert.equal(assessment.source_admission_authority.decision, "candidate");
  assert.equal(assessment.formation.formation_state, "eligible");
  assert.equal(assessment.formation.resolved, true);
  assert.equal(assessment.formation.semantic.evidence_quote, formationSemantic().evidence_quote);
  assert.equal("provider_request_id" in assessment.formation.semantic, false);
  assert.equal("content_text" in assessment.formation.full_context, false);
  assert.equal("canonical_url" in assessment.formation.full_context, false);
  assert.deepEqual(assessment.downstream_authority, {
    incident_identity_assigned: false,
    source_incident_link_created: false,
    problem_signature_assigned: false,
    public_evidence_created: false,
    publication_mutated: false,
  });
});

test("15.9M route is curator-only POST and does not expose a mutation endpoint", async () => {
  const route = await read("app/api/radar/admin/source-signals/[signalId]/formation/route.js");
  assert.match(route, /requireRadarCurator/);
  assert.match(route, /assessSourceFormationForCurator/);
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.doesNotMatch(route, /\.rpc\(/);
});

test("15.9M service has no persistence command surface", async () => {
  const service = await read("lib/sources/source-formation-service.mjs");
  assert.match(service, /getEvaluationSampleIds/);
  assert.match(service, /SOURCE_FULL_CONTEXT_OUTCOME_TABLE/);
  assert.match(service, /resolveSourceProblemFormationAudit/);
  assert.match(service, /source_formation_durable_outcome_ambiguous/);
  assert.match(service, /source_formation_downstream_assignment_exists/);
  assert.doesNotMatch(service, /\.insert\(/);
  assert.doesNotMatch(service, /\.upsert\(/);
  assert.doesNotMatch(service, /\.delete\(/);
  assert.doesNotMatch(service, /\.rpc\(/);
});
