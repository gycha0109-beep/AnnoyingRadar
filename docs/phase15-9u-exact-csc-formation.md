# Phase 15.9U — Exact CSC Formation Assessment

## Status

**IMPLEMENTATION IN REVIEW / LIVE FORMATION NOT EXECUTED**

Phase 15.9T closed with one exact durable full-context `candidate` outcome for the second CSC / carrier-feature Source. Phase 15.9U may assess and append exactly one Formation row for that Source and exact 15.9T outcome.

This phase does not grant Incident identity, Source→Incident linking, Public Problem, Public Evidence, or publication authority.

---

## 1. Exact upstream authority

```text
Source identity SHA256:
b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c

Source content SHA256:
db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4

Durable outcome batch:
phase15.9t-exact-csc-outcome-v0.1

Durable outcome state:
resolved / candidate

Context SHA256:
751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540

Context chars: 3035
Context scope: full_post
Context truncated: false
```

The runner resolves the Source by both Source hashes and the upstream outcome by exact `(source_signal_id, batch_version)`. It does not infer a latest outcome.

It also requires that the Source has exactly one durable outcome overall and zero prior Formation assessments of any batch.

---

## 2. Formation authority

The phase reuses the governed Formation persistence service:

```text
persistFormationAssessmentForCurator(...)
```

That service requires:

```text
Source exists
Source outside Blind evaluation
exact Source has a single resolved Candidate durable outcome
full context currently matches durable outcome hash + length
no downstream Incident/Public Evidence assignment
Formation observer returns a governed state
```

The semantic observer may observe:

```text
problem_claim
experience_actor
friction_specificity
pain_centrality
content_kind
source_origin
friction_responsibility
evidence_quote
problem_mechanism_proposal
incident_summary_proposal
```

The model does **not** decide Incident identity, Incident reuse/create action, Public Problem identity, or publication.

Deterministic Formation states remain:

```text
eligible
provenance_review
review
reject
```

---

## 3. Bounded execution

```text
assessment batch:
phase15.9u-exact-csc-second-formation-v0.1

expected full-context outcome baseline = 86
expected Formation baseline = 1
source network requests max = 1
model calls max = 2
Formation database writes = 1
```

A second model call is allowed only under the existing provider-incomplete recovery path.

---

## 4. Mutation boundary

The only authorized mutation is one append to:

```text
ar_source_formation_assessments
```

All of the following must remain unchanged:

```text
Source Signals / Observations / Ingestion Runs
Raw Inputs / Pain Evidence
full-context outcomes
Incidents
Source→Incident links
curator Incident decisions
Incident executions
Public Problems
Public Evidence
Public Feed
```

A Formation state of `eligible` is still not Incident approval.

---

## 5. Artifact privacy

The disposable live artifact may contain sanitized Source hashes, Formation enums, evidence quote hash/count/grounding, context integrity, model name, request counters, and aggregate count snapshots.

It must not expose Source UUID, durable outcome UUID, URL, author, raw/snippet/full body text, raw evidence quote, provider request ID, Incident UUID, or Public Problem UUID.

---

## 6. Live gate and closeout

The temporary live workflow may execute only after:

```text
exact PR-head CI = SUCCESS
PIE = SUCCESS
expected-head merge = complete
merged-main CI = SUCCESS
```

After one live Formation append and independent production readback, the temporary workflow must be removed in a closeout PR.

If the durable Formation is `eligible`, the next step is a curator decision packet / explicit human curator approval. No Incident mutation occurs until that approval exists.
