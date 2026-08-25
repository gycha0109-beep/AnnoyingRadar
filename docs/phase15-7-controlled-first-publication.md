# Phase 15.7 — Controlled First Publication E2E

## Status

AUTHORIZED — pending execution and closeout

## Purpose

Phase 15.6 closed with two structurally publishable Canonical Public Problem drafts and zero published Problems.

Phase 15.7 is the first explicitly authorized editorial publication step. It validates the complete governed path from curator-approved draft to anonymous Public Radar feed without bypassing the existing publication contract.

This phase is not an automatic publication mechanism.

## Explicit publication intent

Publication of the two current structurally ready drafts is explicitly authorized for this controlled E2E.

Target drafts:

1. `0218d40e-79cd-4b1c-ac8c-0b84405d5ea7`
   - 숙소 예외 취소·환불은 플랫폼과 숙소 사이의 반복 확인을 사용자에게 요구할 수 있다
2. `2be8bc63-1435-4bc9-a4d7-029d58da6dae`
   - 헬스장 환불 지연이 장기화되면 소비자가 외부 절차를 직접 밟아야 한다

Both targets must still be `draft` immediately before execution.

## Required preconditions

Each target must satisfy all existing Phase 15.6E structural publication conditions:

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

The database function `ar_assert_public_problem_publishable()` remains the final structural authority.

## Governed execution path

The only allowed publication mutation is:

```text
ar_set_public_problem_status(
  p_problem_id,
  p_curator_user_id,
  'published'
)
```

The phase must not:

- issue direct `UPDATE ar_public_problems ... status='published'`;
- bypass `ar_require_radar_curator()`;
- bypass `ar_assert_public_problem_publishable()`;
- create synthetic Evidence or Incident rows to satisfy the gate;
- read or mutate the blind 120 set;
- fetch full source bodies;
- broaden singleton evidence into a repeated claim;
- publish any Public Problem other than the two exact targets above.

## Verification contract

After both governed status transitions complete, read-only verification must confirm:

```text
Published Problems:        2
Draft Problems:            0
Public feed rows:          2
Public Evidence feed rows: 5
```

For each published Problem:

- `published_at` is non-null;
- anonymous feed projection contains the Problem;
- anonymous detail Evidence count matches persisted Public Evidence;
- no private Source Signal body is exposed through public projections.

## Failure handling

If a publication mutation is rejected by the DB assertion, stop and preserve the rejected target as `draft`.

If a Problem publishes successfully but post-publication verification reveals a material public projection defect, use the governed lifecycle transition to `archived` rather than a direct status rewrite or draft rollback.

No compensating mutation is permitted merely to make the E2E look successful.

## Delivery boundary

Git/Vercel deployment and Public Problem publication are independent.

A deployment is not required to authorize the database publication transition, and a successful publication does not prove that a Vercel production deployment occurred.

## Closeout evidence

Closeout must record:

- exact publication timestamp/state for both Problems;
- final public feed counts;
- exact Public Evidence feed count;
- whether anonymous public readback matches persisted truth;
- whether any archive/recovery action was required;
- DB mutation scope;
- blind 120 access count;
- deployment verification state.
