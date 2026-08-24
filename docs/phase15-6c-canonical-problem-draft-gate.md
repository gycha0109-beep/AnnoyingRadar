# Phase 15.6C — Canonical Problem Draft Gate

## Status

Implementation ready for CI verification.

Phase 15.6C turns incident-aware repeated problem clusters into **curator-facing, non-persisted draft proposals**.

It does not create `ar_public_problems`, does not write Public Evidence Snapshots, and does not publish anything.

---

## 1. Input authority

The gate accepts only a cluster whose incident identity has already been supplied upstream.

Required cluster shape:

```text
problem_signature
source_signal_ids[]
incident_keys[]
source_count
incident_count
repeat_eligible
```

The gate does not:

- invent `incident_key`;
- infer that two Source rows are independent;
- merge similar incidents;
- synthesize title/summary text on its own.

Those responsibilities remain separate from deterministic draft admission.

---

## 2. Draft eligibility

A supplied canonical Problem proposal is `ready` only when:

```text
repeat_eligible = true
incident_count >= 2
reported incident_count matches distinct incident_keys
reported source_count matches distinct source_signal_ids
problem_signature present
title present and <= 240 chars
summary present and <= 4000 chars
```

If the cluster is a singleton or has only one independent incident, the proposal is `blocked`.

If identity counts and supplied identity lists disagree, the proposal becomes `review` rather than silently assuming independence.

---

## 3. Output boundary

A ready result explicitly carries:

```text
persistence_state = not_persisted
publication_state = not_published
```

`ready` means only:

> This repeated cluster has enough independent incident support to enter curator draft review.

It does not mean:

```text
verified market prevalence
published Public Problem
automatic Product truth
```

---

## 4. Current empirical draft queue

Using the closed Phase 15.6A audit and the Phase 15.6B incident-aware cluster contract, exactly two mechanisms qualify.

### A. Gym refund enforcement

Draft title:

> 헬스장 환불 지연이 장기화되면 소비자가 외부 절차를 직접 밟아야 한다

Draft summary:

> 서로 다른 두 환불 분쟁에서 정상적인 환불 요청만으로 처리가 끝나지 않았고, 소비자가 내용증명·민원·강제집행 등 외부 절차까지 직접 진행해야 했다.

Evidence shape:

```text
3 Source rows
2 independent incidents
```

Two Source rows from the same dispute count as one incident.

### B. Lodging exception refund coordination

Draft title:

> 숙소 예외 취소·환불은 플랫폼과 숙소 사이의 반복 확인을 사용자에게 요구할 수 있다

Draft summary:

> 서로 다른 두 예약 사건에서 예외 취소·환불을 위해 숙소의 승인 또는 응답이 필요했고, 사용자가 예약 플랫폼과 숙소 양쪽에 반복 연락해 절차를 진행해야 했다.

Evidence shape:

```text
2 Source rows
2 independent incidents
```

These texts are draft proposals for curator review. They are not published claims.

---

## 5. Implementation

`lib/sources/canonical-problem-draft.mjs`

```text
evaluateCanonicalProblemDraft()
buildCanonicalProblemDraftQueue()
```

Contract tests verify:

- exactly two empirical repeated clusters enter the draft queue;
- a singleton cannot become a draft candidate;
- multiple posts from one incident cannot satisfy repetition;
- incomplete source/incident identity fails safe to `review`;
- required text and length constraints are enforced;
- all ready outputs remain explicitly non-persisted and non-published.

---

## 6. Preserved boundaries

Phase 15.6C performs:

```text
DB writes           0
DB migrations       0
external LLM calls  0
blind 120 reads     0
production deploys  0
```

The next persistence phase must separately define how incident identity, formation facts, and curator-approved draft provenance are stored before any `ar_public_problems` mutation is authorized.
