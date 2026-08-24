# Phase 15.5E — Source Admission v0.8 Source Intent / Pain Role Calibration

## Status

Implementation calibration in progress. This document does not declare the 669-signal development pool PASS by itself.

## Why v0.8 exists

`source-admission-v0.7` reached a high-precision operating point on the 669-signal development pool, but the independent human audit exposed two structural limits:

1. real complaint events can live under neutral or non-complaint-shaped titles;
2. promotional / SEO content frequently borrows complaint language as empathy copy.

The second failure mode is especially important:

```text
generalized or hypothetical pain
→ “이런 불편 겪으셨죠?” / “저도 불편했어요”
→ immediate product / service / solution pitch
```

The complaint wording is real language, but the pain is a marketing device rather than the source subject.

Therefore:

```text
Problem as subject != Problem as marketing device
first-person wording != first-hand evidence authority
```

## Calibration authority

The completed independent audit used:

- campaign pool: 789
- blind excluded before audit construction: 120
- development pool: 669
- human audit items: 169
  - previous boundary set: 7
  - adversarial REJECT-risk set: 62
  - deterministic random REJECT control: 100

Human labels over those 169 items:

- candidate: 8
- review: 11
- reject: 150

The v0.8 implementation was replayed locally over all 169 audited items and matched the human decision on all 169 calibration items.

This is calibration evidence, not a substitute for a fresh full-pool v0.8 revalidation.

## v0.8 authority model

```text
Source
  ↓
Source Intent
  ├─ experience
  ├─ warning_report
  ├─ systemic_report
  ├─ guide
  ├─ promotion
  └─ unknown
  ↓
Pain Role
  ├─ central
  ├─ ambiguous
  ├─ incidental
  └─ hook
  ↓
CANDIDATE / REVIEW / REJECT
```

### Pain-hook / empathy-bait

A generalized empathy statement followed by a nearby sales/solution pitch is a strong REJECT signal.

Examples:

```text
“은행 앱 새로 깔고 인증하기 번거로우셨죠?”
→ “이 서비스가 해결합니다”
```

```text
“방마다 공기가 답답해서 힘드셨죠?”
→ “오늘 소개할 제품은…”
```

The pain phrase must not be promoted merely because it is written in first person or sounds emotionally concrete.

## Narrow snippet recovery

v0.8 does not make generic snippets candidate authority.

A neutral title can be recovered only when the snippet contains a high-confidence lived event, for example:

- a promised refund did not happen and the responsible contact disappeared;
- a refund is blocked for weeks/months with a concrete monetary amount;
- repeated wasted trips continue for a month or longer.

These may become CANDIDATE.

Moderate lived friction such as repeated order cancellation or an isolated reservation failure under a neutral title remains REVIEW.

Complaint-heavy retrieval text without event authority remains REJECT.

## Warning / report sources

First-hand authorship is no longer a universal requirement for source-level admission.

A warning/report source can be Problem Discovery evidence when the problem itself is the source subject.

Examples:

- recurring illegal-ad warning with the illegal ad itself as the article subject;
- scam warning that concretely describes non-delivery plus support contact breakdown;
- systemic service-access exclusion.

Generic legal/how-to/countermeasure articles remain informational and are not automatically complaint evidence.

## Invariants preserved

- active admission uses no external LLM/API call;
- blind evaluation samples are excluded from development admission/audit before content inspection;
- no production DB authority is created by calibration labels;
- no DB migration is required for v0.8;
- Source Admission still returns source-level candidate/review/reject only;
- candidate is not Pain Evidence and is not a Canonical Problem;
- Vercel production deployment remains disabled.

## Acceptance after implementation

After CI passes, v0.8 must be revalidated on the same 669 development IDs.

Required checks:

1. exact Candidate / Review / Reject distribution;
2. transition matrix from v0.7 → v0.8;
3. all v0.7 high-precision candidates remain valid;
4. human-audited 169 cases replay consistently;
5. newly changed items outside the 169 calibration set are inspected;
6. empathy-bait / Pain → Pitch sources do not enter Candidate;
7. candidate precision remains high;
8. clear false negatives remain low;
9. blind 120 contents/labels remain unread;
10. 0 external LLM/API calls and 0 DB writes.

Only that full-pool revalidation can close v0.8.
