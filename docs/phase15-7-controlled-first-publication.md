# Phase 15.7 — Controlled First Publication E2E

## Status

**CLOSED — 2026-08-25**

## Purpose

Phase 15.6 closed with two structurally publishable Canonical Public Problem drafts and zero published Problems.

Phase 15.7 was the first explicitly authorized editorial publication step. It validated the complete governed path from curator-approved draft to anonymous Public Radar feed without bypassing the existing publication contract.

This phase did not introduce an automatic publication mechanism.

## Explicit publication intent

Publication of the two structurally ready drafts was explicitly authorized for this controlled E2E.

Targets:

1. `0218d40e-79cd-4b1c-ac8c-0b84405d5ea7`
   - 숙소 예외 취소·환불은 플랫폼과 숙소 사이의 반복 확인을 사용자에게 요구할 수 있다
2. `2be8bc63-1435-4bc9-a4d7-029d58da6dae`
   - 헬스장 환불 지연이 장기화되면 소비자가 외부 절차를 직접 밟아야 한다

Both targets were still `draft` immediately before execution.

## Preconditions

Immediately before publication, both targets passed the live database assertion:

```text
ar_assert_public_problem_publishable(problem_id)
```

The existing Phase 15.6E publication conditions therefore remained the active structural authority:

```text
title present
summary present
Evidence snapshots >= 2
distinct source_key >= 2
Incident identity on every Evidence snapshot
distinct Incidents >= 2
publication_basis publishable
external_public Evidence has valid Source Signal ↔ Incident binding
```

No synthetic Evidence or Incident was created to satisfy the gate.

## Governed execution path

Both publication mutations used only:

```text
ar_set_public_problem_status(
  p_problem_id,
  p_curator_user_id,
  'published'
)
```

The RPC itself re-ran:

```text
ar_require_radar_curator()
ar_assert_public_problem_publishable()
```

No direct `UPDATE ... status='published'` was used.

## Publication result

### Lodging exception refund coordination

```text
Problem id:   0218d40e-79cd-4b1c-ac8c-0b84405d5ea7
status:       published
published_at: 2026-08-25 00:13:38.401494+00
               2026-08-25 09:13:38.401494+09:00
Evidence:     2
Incidents:    2
Sources:      2
```

### Gym refund enforcement

```text
Problem id:   2be8bc63-1435-4bc9-a4d7-029d58da6dae
status:       published
published_at: 2026-08-25 00:14:02.637869+00
               2026-08-25 09:14:02.637869+09:00
Evidence:     3
Incidents:    2
Sources:      3
```

## Post-publication verification

Live read-only verification confirmed:

```text
Draft Problems:             0
Published Problems:         2
Archived Problems:          0
Public Problem feed rows:   2
Public Evidence feed rows:  5
```

The two feed rows report Evidence counts of:

```text
lodging exception refund coordination: 2
gym refund enforcement:                3
```

No recovery/archive action was required.

## Anonymous readback

The live database was switched to the `anon` role for readback verification.

Result:

```text
ar_public_problem_feed SELECT:          allowed
ar_public_problem_evidence_feed SELECT: allowed
anonymous Public Problem rows:          2
anonymous Public Evidence rows:         5
```

The anonymous Public Problem feed returned both published Problems with non-null `published_at` values.

The public Evidence projection exposes only the public-safe snapshot fields:

```text
id
public_problem_id
excerpt
publication_basis
source_type
source_label
source_url
source_observed_at
order_index
created_at
updated_at
```

It does not expose private Source Signal `raw_text`, `source_signal_id`, or internal `incident_id`.

## Mutation and access scope

Phase 15.7 execution performed:

```text
Public Problem status RPC mutations: 2
Public Problem rows changed:         2
Evidence mutations:                  0
Incident mutations:                  0
Source Signal mutations:             0
DB migrations:                       0
Blind 120 reads:                     0
Blind 120 mutations:                 0
Full source-body fetches:            0
Archive/recovery transitions:        0
```

## Delivery boundary

Git/Vercel deployment and Public Problem publication remain independent.

Repository-level Git deployment suppression had already been removed before this phase, but the connected Vercel account does not currently expose an AnnoyingRadar project through the available project list.

Therefore:

```text
Public Radar database publication: VERIFIED
Anonymous database feed readback:   VERIFIED
Vercel production deployment:       NOT VERIFIED
```

A database publication result must not be re-labeled as a verified production deployment.

## Closeout

Phase 15.7 is closed with the first two Canonical Public Problems published through the governed curator/database path.

The authoritative public Radar state after closeout is:

```text
2 Published Canonical Public Problems
5 Public Evidence snapshots in the anonymous feed
4 independent Incidents represented across the two Problems
0 draft Problems
0 archived Problems
```

Future publication remains explicit and curator-authorized. This closeout does not grant automatic publication authority to later Source, Evidence, Incident, or Problem candidates.
