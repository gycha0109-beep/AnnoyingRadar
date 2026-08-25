# Phase 15.8A — High-Recall / Low-Cost Discovery Layer

## Status

**CLOSED — 2026-08-25**

Phase 15.8A established a bounded, measurable Source-supply expansion layer without weakening Source Admission, Incident identity, formation, Blind-120, or publication authority.

The first real empirical pilot completed successfully on 2026-08-25 after two fail-closed operational attempts:

1. missing GitHub Actions secrets — blocked before provider request or DB mutation;
2. empty `SUPABASE_SECRET_KEY` prevented legacy `SUPABASE_SERVICE_ROLE_KEY` fallback — blocked before provider request or DB mutation;
3. service fallback fixed in PR #67, then the same bounded pilot completed **PASS**.

## Repository / runtime record

```text
Phase 15.8A implementation PR:  #63
Guarded pilot workflow PR:      #65
Blocked-attempt hardening PR:   #66
Supabase fallback fix PR:       #67
Fallback-fix merge main:        c1c684ad3bf4e7a9ae6b7df8e40c80a8830a730a
GitHub Actions pilot run:        32797010101
Successful pilot job:           97653617527
```

Live migration:

```text
032_source_discovery_telemetry.sql
status: applied
```

## Authority separation

```text
Provider search result
        ↓
Discovery Prefilter      high-recall hard reject only
        ↓
Persisted Source Signal
        ↓
Source Admission         existing precision authority
        ↓
Full-context Formation
        ↓
Incident identity
        ↓
Canonical Problem
```

Discovery Prefilter is not Source Admission.

It can only decide:

```text
continue
reject
```

It cannot create or promote Candidate, Evidence, Incident, Public Problem, or publication state.

## Pool authority

```text
Gold Calibration Pool
= historical Gold acquisition authority

Blind 120
= frozen membership selected from Gold authority

Discovery Pool
= Source Signals observed by completed Discovery-prefiltered runs

Operational Admission Pool
= Gold Calibration Pool ∪ Discovery Pool − Blind 120
```

`loadCampaignPool()` remains Gold-only. Blind sampling and independent historical audit authority remain unchanged.

## Discovery Prefilter v0.1

Version:

```text
source-discovery-prefilter-v0.1
```

Hard rejects remain deliberately narrow:

- obvious sales/listing content;
- obvious informational/guide content without lived or explicit friction;
- obvious commercial content without friction;
- positive-only content without friction;
- missing search text.

Ambiguous material is retained rather than force-rejected.

Rejected source bodies are not persisted by the discovery result object. Telemetry retains aggregate reason codes and acquisition identity only.

## Query plan

Version:

```text
source-discovery-plan-v0.1
```

Deterministic query space:

```text
12 domains
× 2 subject variants
× 8 friction families
= 192 queries
```

Maximum theoretical first-page opportunity space:

```text
192 × 50 = 9,600 result opportunities
```

The full plan was not executed.

## First empirical pilot

Bounded budget:

```text
12 requests
up to 600 result opportunities
actual fetched: 150
```

The initial domain-balanced selection sampled the `contact / 연락 안됨` family across 12 domains.

### Aggregate result

```text
requests:                    12
fetched:                    150
normalized:                 150
cheap rejected:               6
continued:                  144
new Source Signals:         137
duplicates:                   7
Admission Candidates:         1
Admission Reviews:           22
Admission Rejects:          121
failed requests:              0
```

Observed rates:

```text
cheap reject / fetched:             4.00%
new Source / fetched:              91.33%
duplicate / continued:              4.86%
Candidate / continued:              0.69%
Review / continued:                15.28%
Admission Reject / continued:      84.03%
```

Discovery reason distribution:

```text
obvious_informational_guide: 5
obvious_commercial_content:  1
```

### Per-query telemetry

| Query | Fetched | Cheap reject | New | Dup | Candidate | Review | Admission Reject |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 로그인 인증 연락 안됨 | 2 | 0 | 2 | 0 | 0 | 1 | 1 |
| 구독 결제 연락 안됨 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 온라인 쇼핑 연락 안됨 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 배달 주문 연락 안됨 | 3 | 0 | 3 | 0 | 0 | 1 | 2 |
| 병원 예약 연락 안됨 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 전세 계약 연락 안됨 | 2 | 0 | 2 | 0 | 0 | 0 | 2 |
| 숙소 예약 연락 안됨 | 2 | 0 | 2 | 0 | 0 | 1 | 1 |
| 택시 호출 연락 안됨 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 환불 연락 안됨 | 13 | 0 | 13 | 0 | **1** | 3 | 9 |
| 수리 연락 안됨 | 50 | 0 | 50 | 0 | 0 | 1 | 49 |
| 예약 연락 안됨 | 28 | 1 | 24 | 3 | 0 | 6 | 21 |
| 고객센터 연락 안됨 | 50 | 5 | 41 | 4 | 0 | 9 | 36 |

The only Candidate-bearing query in the pilot was:

```text
환불 연락 안됨
```

The clearest request-budget waste was:

```text
수리 연락 안됨
50 fetched → 0 Candidate / 1 Review / 49 Reject
```

Four measured queries returned zero results.

## Boundary verification

Runner before/after snapshot:

```text
Raw Inputs:        10 → 10
Pain Evidence:     27 → 27
Public Problems:    2 → 2
Public Evidence:    5 → 5
Source Incidents:   4 → 4
```

Post-pilot live DB:

```text
Source Signals:        967
Source Observations:  1,024
Discovery Runs:         12
Published Problems:      2
Public Problem feed:      2
Public Evidence:          5
Public Evidence feed:     5
Source Incidents:         4
Blind membership:       120
```

Runner-declared protected operations:

```text
Blind-120 reads:          0
full source-body fetches: 0
publication mutations:    0
```

Therefore:

```text
Source supply mutation:       VERIFIED
Public/Incident mutation:     NONE
Blind membership mutation:    NONE
Formation/publication action: NONE
```

## Empirical conclusion

Phase 15.8A succeeded at **recall expansion and provenance-safe Source acquisition**:

```text
830 Source Signals → 967 Source Signals
```

It did **not** demonstrate strong cheap-filter efficiency.

Only 4% of fetched results were removed by the Discovery Prefilter while 84.03% of continued results were later rejected by Source Admission. The first pilot therefore exposed the next optimization boundary:

> request-budget quality, not downstream threshold relaxation.

The first adaptive scorer also has two empirical defects:

1. a completed zero-result query is treated as `exploration=true`, allowing repeated allocation to a measured empty query;
2. Admission Reject rate is not included in query yield scoring, allowing high-volume / high-reject queries to remain attractive because they produce many novel Source rows.

These are acquisition-allocation defects, not evidence-truth defects.

## Preserved boundaries

Phase 15.8A does not authorize:

- lowering Source Admission thresholds;
- lowering Formation thresholds;
- using Source count as Incident count;
- automatic Incident creation;
- automatic Public Problem creation or publication;
- changing Blind-120 membership;
- redefining Gold calibration membership;
- full source-body fetches in Discovery;
- LLM calls in Discovery Prefilter;
- automatic execution on deploy or merge.

## Next boundary

Phase 15.8B is **Query Allocation Calibration**.

It may use only already-recorded acquisition/admission telemetry to spend provider request budget more efficiently.

It must not change Source Admission semantics, formation semantics, Incident identity, Blind authority, or publication authority.
