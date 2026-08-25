# Phase 15.6 — Source-to-Problem Formation

## Status

```text
15.6A — Empirical formation audit:             CLOSED — 2026-08-24
15.6B — Incident-aware clustering contract:    CLOSED — 2026-08-24
15.6C — Canonical Problem Draft Gate:           CLOSED — 2026-08-24
15.6D — Incident-aware Persistence:             CLOSED — 2026-08-24
15.6E — Curator Review / Publication Readiness: CLOSED — 2026-08-24
```

Phase 15.6 established and then persisted the precision boundary between an admitted Source and a repeatable Canonical Public Problem draft.

Phase 15.6 closeout result:

```text
2 Canonical Public Problem drafts
5 Public Evidence snapshots
4 independent Source Incidents
5 Source→Incident links
0 Published Problems
0 Public feed rows
```

A/B/C were read-only/non-persisting formation stages. Phase 15.6D explicitly authorized persistence of the two qualified drafts and their incident-bound evidence. Phase 15.6E aligned curator review with the incident-aware publication gate. **No Phase 15.6 stage automatically published a Public Problem.**

---

## 1. Why this phase exists

Phase 15.5 closed Source Admission over the 669-signal development pool at:

```text
17 Candidate
0 Review
652 Reject
```

That result answers only:

> Is this Source worth admitting into the complaint/problem discovery flow?

It does **not** answer:

> Is the full source usable as Public Problem evidence?
> Is the friction central after reading the full post?
> Is the source original provenance?
> Do multiple source rows represent independent incidents?
> Does the evidence repeat strongly enough to form a canonical Problem?

Therefore:

```text
Source Admission Candidate
≠ Pain Evidence
≠ independent incident
≠ canonical Public Problem
```

---

## 2. Phase 15.6A empirical audit

### Scope

The exact 17 final admitted development candidates were fetched with the existing fixed-host NAVER full-context fetcher.

Execution boundary:

- 17/17 public full posts fetched successfully;
- full post text was transient and placed only in a one-day disposable GitHub Actions artifact;
- full post text was not logged;
- full post text was not written to Supabase;
- the disposable execution PR was closed without merge;
- the blind 120 evaluation sources were not referenced or read;
- DB writes/migrations: 0;
- production deployments: 0.

### Formation result

```text
17 admitted Source rows
├─ eligible             11
├─ provenance_review     2
├─ review                0
└─ reject                4
```

The 11 eligible Source rows represent only **10 independent incidents** because two posts belong to the same refund dispute series.

### Why four admitted Sources were rejected at formation

Full context exposed failure modes that title/search-snippet admission cannot safely resolve:

1. full-body Pain → Pitch promotion;
2. a self-caused / contractual non-refundable case where the claimed refund denial is not an external service failure;
3. real friction that is only an incidental paragraph inside a general diary;
4. real friction that is only an incidental parenthetical episode inside a broader memoir.

This establishes a new invariant:

> **Every admitted Candidate must pass a full-context Problem Formation gate before it can contribute to Problem formation.**

Selective full context for `REVIEW` alone is insufficient for this later-stage responsibility.

---

## 3. Formation states

Phase 15.6 uses four explicit states:

```text
eligible
provenance_review
review
reject
```

### `eligible`

The full source contains concrete, central, attributable friction and has usable original provenance.

### `provenance_review`

The underlying problem may be valid, but the admitted source is a repost / derivative report or otherwise lacks publication-grade original provenance.

The source must be relinked to an original source before it can become Public Evidence.

### `review`

The full context or evidence grounding remains semantically uncertain.

Uncertainty must not be converted into eligibility or rejection by default.

### `reject`

The full source is not usable for Problem formation, including:

- advertisement / Pain → Pitch promotion;
- informational guide rather than evidence;
- incidental pain;
- self-caused friction;
- contractual-term-only friction;
- natural-event-only friction without a separately identifiable external/system friction mechanism;
- no concrete problem claim.

---

## 4. Semantic observer contract

AI may observe semantic facts but must not decide whether a Public Problem should be created.

Minimum observation schema:

```text
problem_claim
experience_actor
friction_specificity
pain_centrality
content_kind
source_origin
friction_responsibility
evidence_quote
```

Allowed roles include:

```text
experience_actor:
  self
  specific_other
  reported_population
  generic
  unknown

content_kind:
  organic
  news
  repost
  informational
  advertisement
  unknown

source_origin:
  original
  derivative
  unknown

friction_responsibility:
  external_service_or_product
  external_process_or_policy
  structural_system
  contractual_term
  self_caused
  natural_event_only
  mixed
  unknown
```

`evidence_quote` must be an exact contiguous excerpt from the supplied full post when the full post is available.

The deterministic mapper owns the final formation state.

---

## 5. Empirical incident map

The audit snapshot is stored in:

```text
tests/fixtures/phase15-6a-formation-audit.json
```

It is explicitly marked:

```text
empirical_audit_snapshot_not_runtime_truth
```

The snapshot is regression evidence, not a production label table.

### Repeated cluster 1 — gym refund enforcement

Source rows:

```text
a6841585...  ┐
988b812c...  ┘ same author / same dispute series / same incident
b12f82f8...    separate author / separate incident
```

Observed repeated mechanism:

> A gym refund that remains unresolved can force the consumer to escalate through formal notice, complaint, enforcement, or other external procedures.

Counts:

```text
source rows:        3
independent cases:  2
```

### Repeated cluster 2 — lodging exception refund coordination

Independent incidents:

```text
c2507345...  Agoda exception-cancellation case
defa940f...  여기어때 typhoon-cancellation case
```

Observed repeated mechanism:

> Exception cancellation/refund handling can depend on repeated platform ↔ lodging confirmation, leaving the user to contact both sides to unblock the process.

Counts:

```text
source rows:        2
independent cases:  2
```

### Eligible singletons

Six mechanisms currently have only one independent incident each:

```text
third_party_booking_lookup_gap
product_defect_return
brand_impersonation_ad_data_harvest
scheduled_pet_taxi_supplier_cancellation
flight_disruption_downstream_loss
repair_economic_total_loss
```

They remain evidence supply. They are not promoted into repeated canonical Problems solely to increase coverage.

### Provenance review

Two admitted report-style Sources describe plausible real problems but are derivative/reporting surfaces rather than publication-grade original provenance:

```text
pediatric_rehab_capacity
elderly_taxi_digital_exclusion
```

They remain blocked from publication evidence until origin resolution.

---

## 6. Critical correction to the Phase 15.0 publication interpretation

Phase 15.0 originally required:

```text
at least 2 Public Evidence Snapshots
at least 2 distinct source_key values
```

Phase 15.6A shows that `2 distinct source_key` does **not** prove repetition.

Two posts can come from:

```text
same author
same dispute
same provider
same underlying incident
```

and still have different Source keys.

Therefore, for a claim that a problem is repeated, the operational gate is:

```text
at least 2 distinct incident identities
```

`source_key` remains provenance identity. Persisted `incident_id` represents underlying case identity.

Phase 15.6D implemented this correction in the live schema and hardened publication so every external Public Evidence snapshot must carry a valid Source Signal ↔ Incident binding.

---

## 7. Incident authority

AI may propose:

```text
same incident
related incident
same problem mechanism
related problem mechanism
```

but AI does not own incident identity.

Formation helpers accept already supplied incident identity and deliberately do not invent it. Phase 15.6D persists curator-authoritative Incident identities.

This prevents semantic clustering from silently turning several posts about one dispute into several independent cases.

---

## 8. Implemented contracts

### 15.6A/B — formation and clustering

`lib/sources/source-problem-formation.mjs` provides:

```text
resolveProblemFormationSemantic()
buildIncidentAwareProblemClusters()
summarizeProblemFormationAudit()
```

Properties:

- deterministic formation mapping;
- exact-evidence grounding check when full text is supplied;
- derivative/repost → `provenance_review`;
- promotion/informational/incidental/self-caused/contractual-only → `reject`;
- semantic uncertainty → `review`;
- original grounded external/structural friction → `eligible`;
- repeated cluster count uses distinct incident keys, never raw source count.

### 15.6C — canonical draft gate

`lib/sources/canonical-problem-draft.mjs` admits only incident-aware repeated clusters to curator draft review. Exactly two empirical clusters qualified. Singleton evidence remained blocked from repeated canonical claims.

### 15.6D — incident-aware persistence

Live persistence now separates:

```text
Source Signal
→ Source Incident
→ Public Evidence Snapshot
→ Canonical Public Problem draft
```

Phase 15.6D persisted result:

```text
2 draft Problems
5 Evidence snapshots
4 Incidents
5 Source→Incident links
```

Publication requires both distinct source provenance and at least two distinct Incidents.

### 15.6E — curator publication readiness

The curator read model and UI now expose Incident lineage and server-computed structural readiness. Actual publication requires:

```text
incident-aware structural readiness
+ explicit curator publication confirmation
+ database publication assertion
```

Structural readiness is not editorial approval and never auto-publishes.

---

## 9. Phase closeout boundary

Phase 15.6 is **CLOSED through 15.6E**.

Phase 15.6 closeout state:

```text
669 development Source Signals
        ↓ Source Admission + selective resolution
17 admitted Candidates
        ↓ full-context Problem Formation audit
11 eligible Source rows
        ↓ incident dedupe
10 independent eligible incidents
        ↓ problem-mechanism clustering
2 repeated Problem clusters
6 eligible singleton mechanisms
2 provenance-review mechanisms
4 formation rejects
        ↓ Canonical Draft Gate
2 canonical draft proposals
        ↓ Incident-aware Persistence
2 persisted draft Problems / 5 Evidence / 4 Incidents
        ↓ Curator Readiness
2 structurally publishable drafts
0 published Problems
```

### What is not authorized by Phase 15.6

Phase 15.6 does **not** authorize an assistant, background job, model, CI workflow, merge, or deployment to turn either draft into `published` automatically.

The following remain prohibited without a separately defined and explicitly invoked publication step:

- automatic Public Problem publication;
- treating singleton evidence as repeated evidence;
- treating source count as incident count;
- exposing derivative provenance as canonical evidence;
- mutating the blind 120 evaluation set;
- treating a successful CD deployment as publication approval.

### Delivery policy

The repository-level Vercel Git deployment pause was removed after 15.6E closeout. Main pushes/merges are no longer suppressed by `vercel.json`.

Delivery and editorial publication remain independent authorities:

```text
Git/Vercel CD
≠
Public Problem publication
```

### Subsequent publication phase

Phase 15.6 itself authorized no automatic `15.6F` publication step.

A separate phase, **Phase 15.7 — Controlled First Publication E2E**, was explicitly authorized and executed on 2026-08-25. It published the two structurally ready drafts through the governed curator/database status RPC and verified anonymous public feed readback.

See:

```text
docs/phase15-7-controlled-first-publication.md
```

Post-15.7 public state:

```text
Published Problems:        2
Draft Problems:            0
Public feed rows:          2
Public Evidence feed rows: 5
```

This later publication does not retroactively grant Phase 15.6 or future pipeline stages automatic publication authority.
