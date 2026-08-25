# Phase 15.8N — Formation Readiness Audit

## Status

**LIVE VERIFIED / CLOSEOUT READY**

Phase 15.8N is the read-only bridge between durable Phase 15.8M-B Source Admission outcomes and the existing Phase 15.6 Problem Formation authority.

It empirically audited the exact eight durable M-B Candidate Sources against the stricter Formation semantic boundary. It did not create or persist Incident identity, problem-mechanism identity, Canonical Problems, Public Evidence, or publication state.

---

## 1. Implementation authority

Implementation PR:

```text
PR #99
exact head:
320c65fef768a4ca3ff8f78260ed6f6fb5534149

CI #384: SUCCESS
PIE #67: SUCCESS
```

Implementation merged to authoritative main as:

```text
1e460d982c5ce2189df3592ba5b350fe3a68dc4d
```

Merged-main verification:

```text
CI #385: SUCCESS
```

No migration was added.

---

## 2. Why this phase exists

Phase 15.8M-B closed with:

```text
82 durable full-context outcomes
├─ Candidate          8
├─ Reject            66
└─ unresolved Review  8
```

The eight Candidates satisfied the M-B Source Admission semantic contract:

```text
problem_claim        = yes
experience_actor     = self
friction_cause       = external_service_or_product
friction_specificity = concrete
pain_centrality      = central
content_kind         = organic
```

That is not sufficient for Problem Formation.

Phase 15.6 established the stronger invariant:

```text
Source Admission Candidate
≠ Formation-eligible Public Evidence
≠ independent Incident
≠ repeated Problem mechanism
≠ Canonical Problem
```

Formation additionally requires publication-sensitive full-context facts such as:

```text
source_origin
friction_responsibility
exact evidence grounding
formation-specific content-kind interpretation
```

Phase 15.8N therefore re-observed the exact Candidate 8 full posts and passed those observations through the existing deterministic `resolveProblemFormationSemantic()` authority instead of promoting M-B Candidate rows directly.

---

## 3. Frozen upstream authority

Authoritative M-B batch:

```text
phase15.8m-b-remainder-v0.1
```

Live preflight reproduced:

```text
batch rows:          82
Candidate:            8
Reject:              66
unresolved Review:    8
```

The exact Candidate cohort is frozen by sorted Source Signal ID fingerprint:

```text
aa33d9da6ca6940406fcc3f9faec6bb6a390f40741ce580897fb36f94a48b020
```

The runner fails before paid calls if any of those counts or the fingerprint drifts.

The eight unresolved M-B Review outcomes were not included in Formation.

---

## 4. Formation observer authority

Observer:

```text
source-problem-formation-observer-v0.1
prompt:
source-problem-formation-semantic-v0.1
```

The model observes facts only. The existing deterministic Formation mapper owns the state transition.

Formation observation schema:

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

The observer additionally emitted curator aids:

```text
problem_mechanism_proposal
incident_summary_proposal
```

Those two fields are explicitly non-authoritative. They do not create or assign:

```text
incident_key
problem_signature
repeat_eligible
```

The model prompt explicitly denies authority over Formation eligibility, Incident identity, Problem identity, publication, ranking, market value, and product action.

---

## 5. Formation-specific content interpretation

Phase 15.8N deliberately did not inherit M-B `content_kind=organic` as Formation truth.

The stricter Formation observer treats these surfaces as non-evidence when appropriate:

```text
professional-service lead generation
scam-recovery solicitation
affiliate or sponsored promotion
SEO/search-information content
instruction-first how-to content
rewritten or derivative reports
```

This is not a rewrite of M-B history. M-B remains the Source Admission authority for its own stage. Phase 15.8N asks a different downstream question: whether the full post is safe to use for Problem Formation.

---

## 6. Authoritative live audit

Workflow:

```text
Source Formation Audit 15.8N
run: 32830601494
head: 1e460d982c5ce2189df3592ba5b350fe3a68dc4d
conclusion: SUCCESS
```

Disposable one-day artifact:

```text
artifact id: 9556656861
name: source-formation-audit-15-8n
digest:
sha256:5f6523737c1339e5bacad8ab99ea6f0c5ec7ed5922ef856170b1bf9fa21afd0e
```

Artifact authority:

```text
empirical_formation_audit_not_runtime_truth
```

All eight full-context fetches were:

```text
status: resolved
content_scope: full_post
truncated: false
```

Therefore the fetcher's `content_hash` in this authoritative run corresponds to the exact untruncated text presented to the Formation observer. No truncation/hash ambiguity occurred in the live audit.

---

## 7. Machine Formation outcome

Aggregate machine result:

```text
total:               8
eligible:            5
provenance_review:   0
review:              2
reject:              1
resolved:            6
unresolved:          2
```

Reason distribution:

```text
formation_grounded_external_friction   5
formation_non_evidence_content         1
formation_semantic_uncertain           1
source_formation_provider_incomplete   1
```

Formation content kind:

```text
organic        6
informational  1
unknown        1
```

Source origin:

```text
original  7
unknown   1
```

Friction responsibility:

```text
external_service_or_product  6
mixed                        1
unknown                      1
```

M-B vs Formation content-kind disagreement:

```text
1 Source
```

Provider recovery:

```text
provider-incomplete retry attempted: 3
recovered after retry:               2
unrecovered provider-incomplete:     1
```

This machine distribution is empirical audit output. It is not a curator-approved downstream Formation set.

---

## 8. Per-Source audit review

### 8.1 Strong original first-hand evidence — lodging booking omission

Two Sources produced the strongest independent repeated-mechanism proposal.

#### Source `0f33f4e4…`

Title:

```text
분노100%, 최악을 곁들인 여기어때 호텔 숙소 예약 누락 사건 피해 환불 보상 ... 후기
```

Machine state:

```text
eligible
original
organic
external_service_or_product
```

Grounded friction excerpt established that the booked hotel reservation had not actually been secured. The non-authoritative proposal describes a booking intermediary confirmation/fulfillment failure followed by slow replacement handling and user-funded rebooking.

#### Source `d5e70d0d…`

Title:

```text
아고다 호텔 숙소 예약 피해 고객센터 환불 보상 후기
```

Machine state:

```text
eligible
original
organic
external_service_or_product
```

Grounded friction excerpt established that the traveler reached the property and the reservation was absent. The non-authoritative proposal describes reservation fulfillment failure followed by delayed support and refund/compensation friction.

These two Sources concern different trips, different authors, different booking intermediaries, and different real-world episodes. They are the strongest Phase 15.8N evidence for a possible broader repeated mechanism such as:

```text
lodging intermediary reservation confirmation / fulfillment failure
```

However Phase 15.8N does **not** assign them two Incident IDs and does **not** assign a shared `problem_signature`.

Therefore:

```text
possible repeated mechanism proposal = YES
repeat_eligible authoritative cluster = NO
```

A separate curator-governed Incident/mechanism assignment phase is required.

### 8.2 Strong singleton proposal — mobile plan port-out restriction

Source `f7013086…`

Title:

```text
알뜰폰 고고모바일 피해야 하는 이유!! 번호이동제한서비스 강제가입 피해 사례 실제 경험담 공유
```

Machine state:

```text
eligible
original
organic
external_service_or_product
```

The grounded audit observed automatic enrollment in a port-out restriction service and a discount-clawback amount when cancelling/porting out.

This is a useful Formation candidate but currently has no second independent Incident in the Phase 15.8N cohort.

### 8.3 Machine eligible but curator reread required — delivery-delay article

Source `2d2500ef…`

Title:

```text
배송지연 중에도 당황하지 않는 내 경험담
```

Machine state:

```text
eligible
```

The machine found a grounded first-person delivery-delay episode. However the stored source presentation transitions into general coping/advice language, and the source surface has characteristics compatible with generic SEO/informational content.

Closeout review therefore marks it:

```text
MACHINE_ELIGIBLE
CURATOR_REREAD_REQUIRED
NOT SAFE FOR INCIDENT / PROBLEM ASSIGNMENT YET
```

The machine outcome remains recorded as produced; it is not silently rewritten.

### 8.4 Machine eligible but curator reread required — legal-response article

Source `5c311cc5…`

Title:

```text
안산 온라인 쇼핑몰 사기 피해자 변호사 알아보기 전 내가 먼저 정리했던 피해 대응의 기준
```

Machine state:

```text
eligible
```

The machine grounded a real evidence-organization burden in a claimed shopping-scam episode. However the title/surface is compatible with legal SEO or professional lead-generation framing, and its proposed mechanism centers heavily on evidence organization rather than the underlying commerce failure.

Closeout review therefore marks it:

```text
MACHINE_ELIGIBLE
CURATOR_REREAD_REQUIRED
NOT SAFE FOR INCIDENT / PROBLEM ASSIGNMENT YET
```

Again, this is a curator safety hold, not a retrospective mutation of the audit output.

### 8.5 Mixed-responsibility review

Source `29e829a6…`

Title:

```text
아고다 환불불가상품 전액 환불 요청 - 숙소 문의, 한국소비자원 피해구제 신청
```

Machine state:

```text
review
reason: formation_semantic_uncertain
friction_responsibility: mixed
```

The full post contains a real refund dispute, but the interaction between a non-refundable booking term, the user's cancellation request, host response, and external-process friction prevented a clean Formation responsibility assignment.

It remains blocked from downstream Formation authority.

### 8.6 Provider-incomplete review

Source `b7e9c5f3…`

Title:

```text
upi id 인도 검색 급증 이유와 결제 오류 전에 꼭 알아야 할 위험 신호
```

Machine state:

```text
review
reason: source_formation_provider_incomplete
semantic attempts: 2
```

The stored presentation appears information-first, but Phase 15.8N does not convert that impression into an authoritative reject because the Formation semantic audit remained unresolved.

It stays blocked unless a later governed remediation step resolves it.

### 8.7 Formation reject — informational scam-warning surface

Source `fabae80b…`

Title:

```text
유로닉스 사기 사칭 직구했는데 배송도 안 되고 연락 두절. 해외 쇼핑몰 피해 해결가능해요
```

Machine state:

```text
reject
reason: formation_non_evidence_content
content_kind: informational
```

The audit also found that the author stopped before ordering and avoided the claimed purchase loss. This is the one observed M-B-vs-Formation content-kind disagreement and demonstrates why Source Admission `organic` cannot be treated as publication-evidence truth.

---

## 9. Curator-ready interpretation of the machine output

The raw machine result is:

```text
5 eligible / 0 provenance_review / 2 review / 1 reject
```

The closeout safety interpretation is stricter:

```text
strong downstream candidates:             3
  lodging booking omission #1             1
  lodging booking omission #2             1
  mobile plan port-out restriction        1

machine-eligible, curator reread required: 2
  generic delivery-delay/advice surface   1
  legal/SEO-response surface              1

blocked review:                           2
reject:                                   1
```

`strong downstream candidate` is still not a persisted Formation state, Incident, or Problem. It means only that the audit evidence is sufficiently coherent to justify the next curator review phase.

---

## 10. Incident and mechanism authority remains absent

Independent DB inspection confirmed:

```text
new M-B Candidate Sources already linked to an Incident: 0 / 8
```

The existing `ar_register_source_incident(...)` authority is curator-gated. Phase 15.8N did not invoke it.

No new Source received:

```text
incident_id
incident_key
problem_signature
repeat_eligible
```

The lodging pair is therefore a **proposal for curator comparison**, not an authoritative repeated cluster.

The next phase must explicitly determine:

1. whether each strong candidate maps to one independently identifiable real-world Incident;
2. whether either Source is actually the same episode as any existing Incident;
3. whether the two lodging Sources share one sufficiently stable Problem mechanism;
4. whether the two machine-eligible safety-hold Sources should be accepted or rejected after curator reread;
5. only after those decisions, whether any Incident/mechanism assignments should be persisted.

---

## 11. Provider recovery boundary

Each Candidate received:

```text
base Formation semantic attempt: 1
provider-incomplete retry:       max 1
semantic attempts per Source:    max 2
```

Only:

```text
source_formation_provider_incomplete
```

could trigger the second semantic attempt.

Observed:

```text
retry attempted: 3
retry recovered: 2
retry exhausted: 1
```

No broader recovery policy was activated.

---

## 12. Disposable artifact privacy

The live artifact may contain:

```text
Source Signal ID
public title
published timestamp
prior M-B semantic facts
Formation state / reason
Formation semantic facts
exact evidence quote
non-authoritative mechanism proposal
non-authoritative incident summary proposal
content hash / scope / char count / truncation
recovery metadata
```

It excludes:

```text
full source body
canonical URL
fetched URL
author handle
provider request ID
```

Full source bodies remained ephemeral and were not written to Supabase.

---

## 13. Database read-only verification

Pre-live protected state:

```text
ar_source_signals                         3245
ar_source_signal_observations             3537
ar_source_ingestion_runs                   132
ar_raw_inputs                               10
ar_pain_evidences                           27
ar_public_problems                           2
ar_public_problem_evidence_snapshots         5
ar_source_incidents                          4
ar_source_incident_links                     5
ar_source_full_context_resolution_outcomes  82
```

Independent post-live readback:

```text
ar_source_signals                         3245
ar_source_signal_observations             3537
ar_source_ingestion_runs                   132
ar_raw_inputs                               10
ar_pain_evidences                           27
ar_public_problems                           2
ar_public_problem_evidence_snapshots         5
ar_source_incidents                          4
ar_source_incident_links                     5
ar_source_full_context_resolution_outcomes  82
```

Therefore:

```text
DB mutations:                 0
Incident mutations:           0
Public Evidence mutations:    0
Canonical Problem mutations:  0
Publication mutations:        0
M-B outcome mutations:        0
```

The Blind evaluation membership table was not queried by the runner.

---

## 14. M-B unresolved cohort remains blocked

The eight unresolved M-B Review outcomes did not enter Formation.

Durable reason distribution remains:

```text
source_full_context_invalid_evidence_quote    5
full_context_url_invalid                      1
source_full_context_provider_missing_output   1
source_full_context_provider_network_error    1
```

They remain a separate Source Resolution remediation backlog.

Phase 15.8N did not reinterpret them as Candidate, Reject, or Formation evidence.

---

## 15. Trigger closeout

The authoritative one-shot live trigger was:

```text
agent/phase15-8n-live-execution
```

The closeout changeset removes this push trigger. After closeout, the workflow retains:

```text
workflow_dispatch
```

only, while continuing to checkout authoritative `main`.

---

## 16. Closeout condition

Phase 15.8N is ready to close when this closeout changeset:

```text
passes exact-head CI / PIE
→ merges to main
→ merged-main CI succeeds
```

After that point:

```text
Phase 15.8N = CLOSED
Formation audit = COMPLETE
Incident identity persistence = NOT AUTHORIZED
Problem signature persistence = NOT AUTHORIZED
Canonical Problem draft persistence = NOT AUTHORIZED
Publication = NOT AUTHORIZED
```

---

## 17. Recommended next governed phase

The evidence supports a separate **Incident / Problem Mechanism Assignment Review** rather than direct Formation persistence.

Its first responsibility should be read-only curator decision material over:

```text
A. strong lodging booking-omission pair
B. mobile-plan singleton
C. two machine-eligible curator-reread holds
```

Only curator-confirmed decisions should be allowed to cross into `ar_source_incidents`, Source→Incident links, or canonical Problem formation.
