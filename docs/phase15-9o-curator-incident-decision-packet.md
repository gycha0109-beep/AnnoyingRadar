# Phase 15.9O — Curator Incident Decision Packet

## Status

**IMPLEMENTED / LIVE NOT YET RUN**

Phase 15.9O consumes an explicit durable Phase 15.9N Formation assessment and constructs a curator-readable Incident decision packet without creating any new authority-bearing decision or database mutation.

It generalizes the useful read-only boundary from historical Phase 15.8O while removing the old fixed-cohort/hash-map approval model.

---

## 1. Upstream authority

Phase 15.9N closed with a new private append-only Formation authority:

```text
public.ar_source_formation_assessments
```

The first controlled row is:

```text
assessment batch = phase15.9n-ordinal9-persistence-v0.1
status = resolved
formation_state = eligible
```

That row remains Formation authority only.

```text
Formation eligible ≠ evidence accepted by curator
Formation eligible ≠ Incident identity
Formation eligible ≠ repeated problem mechanism
Formation eligible ≠ Public Evidence
Formation eligible ≠ publication
```

---

## 2. Why 15.9O exists

Historical Phase 15.8O demonstrated the correct human boundary but was intentionally one-shot:

- exact eight-source cohort;
- Source-ID hashes committed as a frozen disposition map;
- fixed comparison proposals;
- blank curator decision template;
- no persistence.

Historical Phase 15.8P then encoded explicit approval for exactly two hashed Sources.

Those phase artifacts remain valid historical authority, but they are not a generic runtime path for new durable Formation assessments.

15.9O therefore creates the reusable read-only handoff:

```text
explicit durable Formation assessment
        ↓
exact context + evidence reconstruction
        ↓
current Incident/Public Problem comparison authority
        ↓
blank curator Incident decision template
```

The final output is still a packet, not a decision.

---

## 3. Explicit assessment identity — no latest-row-wins

Runtime endpoint:

```text
GET /api/radar/admin/source-signals/:signalId/incident-decision-packet
  ?formationAssessmentId=<uuid>
```

The caller must provide the exact Formation assessment ID.

The service does not:

```text
pick latest Formation row
pick newest Candidate row
infer authority from assessment_batch_version
rerun the Formation model
```

If `formationAssessmentId` is absent, the request fails closed.

The explicit assessment must belong to the requested Source and must currently be:

```text
status = resolved
resolved = true
formation_state = eligible
context_status = resolved
context_scope = full_post
context_truncated = false
evidence_quote_grounded = true
```

---

## 4. Pre-body authority gates

Before loading Source URL/body, the service requires:

1. Source Signal exists;
2. Source is outside Blind evaluation;
3. the exact Formation assessment ID exists for that Source;
4. that assessment is resolved/eligible with complete context authority;
5. reconstructable grounded evidence metadata exists;
6. Source has no existing Incident link;
7. Source has no Public Evidence assignment.

Only after these checks may the service load the Source transport identity and re-fetch public full context.

---

## 5. Context-integrity and evidence reconstruction

15.9N deliberately did not persist the raw evidence quote or full source body.

15.9O re-fetches the current public context using the existing bounded full-context acquisition policy and requires:

```text
current content scope = full_post
current context truncated = false
SHA-256(current content_text) = fetch-declared content_hash
SHA-256(current content_text) = durable Formation context SHA-256
current JS string length = durable Formation context char count
fetch original_char_count = durable Formation context char count
```

The evidence quote is then reconstructed from the 15.9N UTF-16 offsets:

```text
quote = content_text.slice(evidence_quote_start, evidence_quote_end)
```

Required integrity:

```text
quote length = durable quote char count
SHA-256(quote) = durable evidence_quote_sha256
```

Any source drift, offset drift, or quote-hash mismatch fails closed before a curator packet is returned.

No Formation model call occurs in 15.9O.

---

## 6. Curator-visible packet

The curator-only packet may include runtime source material necessary to make an actual decision:

```text
Source platform
canonical public URL
author handle
published timestamp
title
exact integrity-bound full context
reconstructed grounded evidence quote
Formation semantic facts
Formation mechanism/Incident proposals
current Incident authority
current Public Problem authority
```

The current Incident comparison projection contains:

```text
incident id
incident key
label
source count
created/updated timestamps
```

The current Public Problem comparison projection contains:

```text
public problem id
title
summary
category
status
problem_signature
evidence count
distinct Incident count
published timestamp
```

These are comparison facts, not automatic identity matches.

---

## 7. Blank curator decision template

Every authority-bearing decision field starts `null`:

```text
evidence_decision    = null
incident_action      = null
existing_incident_id = null
new_incident_key     = null
new_incident_label   = null
notes                = null
```

And:

```text
persistence_authorized = false
```

15.9O does not infer `accept`, `create_new`, `reuse_existing`, an Incident key, or any problem signature from the Formation model proposals.

Problem-mechanism/repeated-cluster authority remains a later governed decision boundary after Incident identity itself is decided.

---

## 8. Runtime security boundary

The endpoint is:

```text
curator-only
GET-only
```

It uses the existing `requireRadarCurator()` authority.

There is no POST/PUT/PATCH/DELETE write endpoint in this phase.

The route/service contain no:

```text
insert
upsert
update
delete
RPC mutation
Formation model invocation
```

---

## 9. Controlled live verification

A phase-specific runner targets only the exact 15.9N controlled batch:

```text
phase15.9n-ordinal9-persistence-v0.1
```

The runner dynamically resolves the single durable assessment row from the database. No Source UUID or Formation assessment UUID is committed to Git.

Live budgets:

```text
target Formation assessments = 1
source network requests <= 8
model calls = 0
database writes = 0
```

Before/after snapshots cover:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_public_problem_feed
ar_source_incidents
ar_source_incident_links
ar_source_full_context_resolution_outcomes
ar_source_formation_assessments
```

All counts must remain exactly unchanged.

---

## 10. Disposable verification artifact

The one-day verification artifact deliberately excludes:

```text
Source Signal UUID
Formation assessment UUID
canonical URL
author handle
full source body
raw evidence quote
provider request ID
```

It may preserve non-identifying integrity authority such as:

```text
assessment batch
Formation state/reasons/semantic facts
context SHA-256 and char count
evidence quote SHA-256 and char count
existing Incident/Public Problem counts
network/model/write counts
blank decision status
protected-domain before/after counts
```

The runtime curator API is allowed to return exact source/evidence material because it is curator-authenticated; the disposable CI artifact remains data-minimized.

---

## 11. Release flow

```text
implementation branch
→ exact-head CI / PIE
→ merge to main
→ merged-main CI
→ independent production preflight
→ temporary live branch from exact main
→ one read-only authoritative packet run
→ inspect disposable artifact
→ independent zero-mutation DB readback
→ closeout PR removes temporary trigger
→ exact-head CI / PIE
→ merge closeout
→ merged-main CI
→ Phase 15.9O CLOSED
```

No migration is required.

---

## 12. Explicitly unauthorized

Phase 15.9O does not authorize:

```text
latest-row Formation inference
client-submitted Formation model result
curator decision persistence
Incident creation
Incident reuse/link mutation
Source→Incident persistence
problem_signature assignment
repeated-problem clustering authority
Canonical Problem persistence
Public Evidence persistence
publication
```

The next phase may introduce an explicit curator decision record or controlled Incident persistence only after a real curator decision exists as a separate governed authority.
