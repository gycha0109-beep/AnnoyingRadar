# Phase 7.2 — Grounded AI Idea Generator

## Status

- Stage: Phase 7.2 implementation / verification
- Baseline: `main@178b1dd66f10334847ac583f232f910b7e28805d`
- Depends on: Phase 7.1 Idea Candidate persistence foundation
- Scope: server-side grounded Idea generation, API, validation, persistence handoff, provider evaluation harness
- Out of scope: Idea review UI, Idea Board, Research Projects, web research, competitor lookup, ranking/scoring, automatic status promotion

## Design review

Phase 7.2 keeps the Phase 7.0/7.1 domain boundary unchanged:

```text
confirmed Problem Card
+ linked confirmed Evidence
+ completed source Raw Input
→ OpenAI Structured Output
→ deterministic provider validation
→ ar_persist_idea_generation_batch
```

No new database migration is required.

### Source boundary

The generator receives only the selected confirmed Problem Card and Evidence linked to that Problem Card. The full Raw Input is not sent to the provider.

Server-side source loading rechecks:

- current user owns the Problem Card
- Problem Card status is `confirmed`
- source Raw Input is `completed`
- `evidence_count >= 1`
- link count equals stored evidence count
- every linked Evidence belongs to the same user and Raw Input
- every linked Evidence remains `confirmed`

Invalid sources are rejected before any provider request.

### Provider contract

The implementation uses the OpenAI Responses API with strict JSON Schema Structured Outputs.

Provider-only output adds:

```text
grounding_evidence_refs[]
```

Each generated idea must reference at least one supplied Evidence ref. These refs are validated against the exact request-local Evidence set, converted to internal Evidence IDs for diagnostics, and stripped before Phase 7.1 persistence so the persisted Idea Candidate contract remains unchanged.

The persistent fields remain:

```text
title
one_liner
target_user
problem_statement
core_value
first_build_scope
excluded_scope
implementation_difficulty
monetization_hint
first_screen_idea
```

### Grounding guard

Deterministic post-validation rejects:

- unknown or duplicated Evidence refs inside an Idea
- unsupported/missing provider fields
- duplicate Idea titles in one generation batch
- invalid Phase 7.1 Idea field values
- certainty claims such as validated/proven demand or competitor absence
- a non-null `monetization_hint` that is not explicitly framed with `가설:`

The prompt separately instructs the model not to assert market size, revenue, competitor facts, validated demand, or implementation certainty from outside the supplied source.

`implementation_difficulty` remains a categorical first-build estimate:

```text
low | medium | high | unknown
```

It is not an engineering certainty score.

### Failure semantics

- provider configuration failure: zero DB writes
- invalid source: provider is not called
- provider timeout/network/auth/rate-limit/refusal/incomplete response: zero DB writes
- malformed or ungrounded provider output: zero DB writes
- persistence validation failure: Phase 7.1 atomic RPC rolls back the entire batch
- successful regeneration appends another batch and never replaces earlier Ideas

## API

### Generate

```text
POST /api/problem-candidates/:candidateId/ideas/generate
```

Response status: `201`

Returns persisted Ideas plus generation provenance.

### List

```text
GET /api/problem-candidates/:candidateId/ideas
```

Returns owner-scoped Idea Candidates, generation batches, and status history.

## Environment

```text
OPENAI_API_KEY
OPENAI_IDEA_MODEL
OPENAI_IDEA_TIMEOUT_MS
```

`OPENAI_IDEA_MODEL/TIMEOUT` fall back to the existing Candidate/Evidence provider configuration when omitted.

## Verification gates

Automated:

- provider unit tests with mocked Responses API
- strict schema contract
- Evidence ref grounding validation
- prompt-injection-as-data contract
- unsupported certainty rejection
- hypothesis framing
- invalid-source-before-provider ordering
- route ownership/persistence contract
- existing repository lint/test/release/build/runtime CI

Credential-surface live provider evaluation:

```text
npm run eval:ideas:live
```

The fixture includes normal grounded cases and an Evidence payload containing an instruction-injection attempt. Live evaluation is not a CI secret requirement.
