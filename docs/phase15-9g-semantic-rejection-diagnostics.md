# Phase 15.9G — Resolved External Context Semantic Rejection Diagnostics

## Status

**IMPLEMENTED / LIVE DIAGNOSTIC NOT YET RUN**

Phase 15.9G follows the closed Phase 15.9F external-web full-context acquisition pilot.

15.9F established that all sixteen deterministic external-web pilot Sources can be acquired successfully under `bounded_public_html`. Phase 15.9G answers the next question only:

> Do those stable full contexts support the existing Source Admission rejections, or do they expose false negatives hidden by search snippets?

No durable classification or downstream authority is changed by this phase.

---

## 1. Frozen sample authority

15.9G reconstructs the same Phase 15.9C campaign and the same deterministic external sample used in 15.9F:

```text
8 ingestion runs
351 observations
313 newly inserted Sources
blind overlap = 0 before canonical URL/body read
actual origins = 5 naver_blog / 308 external_web
```

The sample remains exactly sixteen external-web Sources:

```text
4 x title_no_complaint_signal
4 x snippet_information_only
4 x title_truncated_no_complaint_signal
4 x title_information_or_guide
```

Selection reuses `selectPhase15_9FExternalPilot()` so Phase 15.9G cannot silently choose a more favorable sample.

---

## 2. Stable-body gate

Source bodies remain ephemeral.

Each sampled Source is fetched twice under the closed 15.9F acquisition contract:

```text
external-web-full-context-fetch-v0.1
bounded_public_html
```

The semantic judge is allowed only when both acquisitions are:

```text
resolved
not truncated
same content_hash
same original_char_count
same extraction_scope
same title
```

If any of those conditions differ, that Source receives:

```text
full_context_pair_changed
```

or:

```text
full_context_pair_unavailable
```

and no model call occurs for that Source.

This prevents a semantic verdict from being attached to a moving or inconsistently extracted page.

---

## 3. Semantic authority reuse

15.9G does not define a new semantic policy.

It reuses the existing authority:

```text
source-full-context-semantic-v0.1
resolveFullContextSemantic()
```

The judge observes only:

```text
problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind
evidence_quote
```

The existing resolver remains authoritative for:

```text
candidate
review
reject
```

Interpretation remains identical to Phase 15.9D:

```text
candidate -> false_negative_confirmed
review    -> false_negative_possible
reject    -> policy_consistent
```

The model does not own those final policy labels; it only returns the structured semantic facts.

---

## 4. Origin context passed to the judge

Historical Source identity remains:

```text
source_platform = naver_blog
```

for NAVER API HUB Blog Search results, including historical external-web results.

Phase 15.9E established that this identity namespace is not the same thing as actual content origin. Therefore 15.9G passes:

```text
Source platform: external_web
```

into the semantic judge for these sampled pages.

This does not change the stored `source_platform`; it prevents the semantic prompt from reintroducing the provider/origin conflation repaired in 15.9E.

---

## 5. Bounded execution

Maximum source fetch requests:

```text
16 Sources
x 2 acquisitions
x maximum 4 HTTP requests per acquisition including redirects
= 128 source-network requests maximum
```

Maximum semantic model calls:

```text
16
```

Model authority remains the repository-configured full-context model. The live workflow freezes:

```text
gpt-5-mini-2025-08-07
```

One model call maximum is permitted per Source, and only after stable-body verification.

---

## 6. Artifact privacy

The one-day artifact may contain:

```text
rejection stratum
external identity hash
source content hash
origin-host hash
first/second context hashes and lengths
stable/unstable status
extraction scope
title SHA-256
semantic categorical observations
evidence excerpt length and SHA-256 only
existing resolver decision/reason codes
model identifier and token usage
aggregate DB counts
```

It must not contain:

```text
Source Signal UUID
canonical URL
author handle
raw search snippet
full body text
exact evidence quote
provider request ID
Incident UUID
Public Problem UUID
```

---

## 7. Read-only boundary

Phase 15.9G authorizes no writes.

```text
database writes = 0
full-context outcome persistence = 0
Source Admission mutation = 0
origin backfill = 0
Incident creation = 0
Source→Incident linking = 0
problem_signature assignment = 0
Canonical Problem creation = 0
Public Evidence persistence = 0
publication = 0
```

Candidate results, if any, are diagnostic findings only.

A separate human/curator-governed phase would be required before any durable Source Admission recovery, Incident creation, or downstream persistence.

---

## 8. Release sequence

```text
implementation PR
-> exact-head CI / PIE
-> merge main
-> merged-main CI
-> one-shot live semantic diagnostic
-> artifact inspection
-> independent DB readback
-> remove temporary push trigger
-> closeout PR
-> merged-main CI
```
