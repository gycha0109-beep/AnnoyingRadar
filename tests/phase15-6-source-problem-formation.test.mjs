import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildIncidentAwareProblemClusters,
  resolveProblemFormationSemantic,
  summarizeProblemFormationAudit,
} from "../lib/sources/source-problem-formation.mjs";

const audit = JSON.parse(await readFile(
  new URL("./fixtures/phase15-6a-formation-audit.json", import.meta.url),
  "utf8",
));

function groundedSemantic(overrides = {}) {
  return {
    problem_claim: "yes",
    experience_actor: "self",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    source_origin: "original",
    friction_responsibility: "external_service_or_product",
    evidence_quote: "exact friction evidence",
    ...overrides,
  };
}

test("Phase 15.6A empirical audit snapshot remains 17 -> 11/2/0/4", () => {
  assert.equal(audit.authority, "empirical_audit_snapshot_not_runtime_truth");
  assert.equal(audit.items.length, 17);
  assert.deepEqual(summarizeProblemFormationAudit(audit.items), {
    total: 17,
    eligible: 11,
    provenance_review: 2,
    review: 0,
    reject: 4,
    eligible_incidents: 10,
    repeated_problem_clusters: 2,
  });
});

test("incident-aware clustering does not count two posts from one case as two incidents", () => {
  const clusters = buildIncidentAwareProblemClusters(audit.items);
  const gym = clusters.find((cluster) => cluster.problem_signature === "gym_refund_enforcement");
  assert.ok(gym);
  assert.equal(gym.source_count, 3);
  assert.equal(gym.incident_count, 2);
  assert.equal(gym.repeat_eligible, true);
  assert.deepEqual(gym.incident_keys, ["gym_chlovely_case", "gym_lalaland_case"]);
});

test("only the two empirically repeated mechanisms qualify as repeated clusters", () => {
  const repeated = buildIncidentAwareProblemClusters(audit.items)
    .filter((cluster) => cluster.repeat_eligible);
  assert.deepEqual(
    repeated.map((cluster) => [cluster.problem_signature, cluster.incident_count]),
    [
      ["gym_refund_enforcement", 2],
      ["lodging_exception_refund_coordination", 2],
    ],
  );
});

test("grounded original first-hand external friction is formation-eligible", () => {
  const result = resolveProblemFormationSemantic(groundedSemantic(), {
    fullText: "prefix exact friction evidence suffix",
  });
  assert.equal(result.formation_state, "eligible");
  assert.equal(result.resolved, true);
});

test("original reporting can be eligible when it carries concrete attributable structural evidence", () => {
  const result = resolveProblemFormationSemantic(groundedSemantic({
    experience_actor: "reported_population",
    content_kind: "news",
    friction_responsibility: "structural_system",
  }), {
    fullText: "exact friction evidence",
  });
  assert.equal(result.formation_state, "eligible");
});

test("derivative or reposted evidence requires provenance resolution instead of publication eligibility", () => {
  const derivative = resolveProblemFormationSemantic(groundedSemantic({
    experience_actor: "reported_population",
    content_kind: "news",
    source_origin: "derivative",
    friction_responsibility: "structural_system",
  }), { fullText: "exact friction evidence" });
  assert.equal(derivative.formation_state, "provenance_review");

  const repost = resolveProblemFormationSemantic(groundedSemantic({
    experience_actor: "reported_population",
    content_kind: "repost",
    source_origin: "original",
    friction_responsibility: "structural_system",
  }), { fullText: "exact friction evidence" });
  assert.equal(repost.formation_state, "provenance_review");
});

test("full-context promotion and incidental pain are rejected", () => {
  assert.equal(resolveProblemFormationSemantic(groundedSemantic({
    content_kind: "advertisement",
  })).formation_state, "reject");
  assert.equal(resolveProblemFormationSemantic(groundedSemantic({
    pain_centrality: "incidental",
  })).formation_state, "reject");
  assert.equal(resolveProblemFormationSemantic(groundedSemantic({
    content_kind: "informational",
  })).formation_state, "reject");
});

test("self-caused, contractual-only, and natural-event-only friction cannot form a Problem by themselves", () => {
  for (const frictionResponsibility of ["self_caused", "contractual_term", "natural_event_only"]) {
    const result = resolveProblemFormationSemantic(groundedSemantic({
      friction_responsibility: frictionResponsibility,
    }));
    assert.equal(result.formation_state, "reject");
  }
});

test("an external process can remain eligible even when the upstream trigger was user change or weather", () => {
  const result = resolveProblemFormationSemantic(groundedSemantic({
    friction_responsibility: "external_process_or_policy",
  }), { fullText: "exact friction evidence" });
  assert.equal(result.formation_state, "eligible");
});

test("missing, ungrounded, or uncertain evidence fails safe to review", () => {
  assert.equal(resolveProblemFormationSemantic(groundedSemantic({
    evidence_quote: null,
  })).formation_state, "review");

  assert.equal(resolveProblemFormationSemantic(groundedSemantic(), {
    fullText: "different text",
  }).formation_state, "review");

  assert.equal(resolveProblemFormationSemantic(groundedSemantic({
    source_origin: "unknown",
  })).formation_state, "review");
});
