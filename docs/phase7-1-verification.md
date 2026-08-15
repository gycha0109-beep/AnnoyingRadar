# Phase 7.1 Verification

## Scope

Idea Candidate database, security, lifecycle, and JavaScript contract foundation.

## Hosted authority

Supabase project: `RanKing&Radar` (`yjdubukqkcvkymabskzd`).

Applied migration:

```text
phase7_1_idea_candidate_foundation
```

The migration creates only `ar_`-prefixed AnnoyingRadar objects and does not modify the unrelated Ranking domain.

## Database verification

Rollback-based hosted integration fixture: **PASS**.

Covered:

- confirmed Problem Card + completed Raw Input source eligibility
- rejection of unconfirmed Problem Candidate sources
- rejection of confirmed sources whose Raw Input is not completed
- atomic generation-batch + `1..3` Idea Candidate persistence
- initial `candidate` status-event creation
- append-only regeneration preserving existing Idea Candidates
- failed multi-item generation leaving no partial batch
- guarded Idea Candidate edit RPC
- source identity and status excluded from content patching
- categorical implementation difficulty
- `candidate → researching → build_soon` transitions
- same-status transition rejection
- invalid `discarded → build_soon` transition rejection
- append-only status history
- authenticated direct-write denial
- service-role direct-write denial
- authenticated owner-scoped SELECT grant
- mutation RPC execute privilege restricted to `service_role`

## Hosted poststate checks

All three Phase 7.1 tables have RLS enabled:

```text
ar_idea_generation_batches
ar_idea_candidates
ar_idea_candidate_status_events
```

Table privileges for `authenticated` and `service_role` are SELECT-only. `anon` has no table privilege.

All three mutation RPCs are `SECURITY DEFINER`; `anon` and `authenticated` cannot execute them, while `service_role` can:

```text
ar_persist_idea_generation_batch
ar_update_idea_candidate
ar_set_idea_candidate_status
```

Supabase security advisor produced no Phase 7.1 `ar_idea_*` finding. Existing findings belong to unrelated pre-existing shared-project objects.

Supabase performance advisor produced no unindexed-foreign-key or RLS-init-plan finding for Phase 7.1 tables. Newly created indexes are naturally reported as unused before production traffic and are not treated as a defect.

## Contract verification

JavaScript contracts freeze:

```text
status:
candidate / researching / build_soon / paused / discarded / archived

implementation_difficulty:
low / medium / high / unknown
```

Generation drafts are strict and bounded to `1..3`; no numeric business, marketability, or ranking score is introduced.

## Review gates

- Physical Problem Card identity remains `ar_problem_candidates.id`.
- No separate `problem_cards` table is introduced.
- Idea generation does not mutate `ar_raw_inputs.analysis_status`.
- Generation is append-only and non-destructive.
- Status changes and history insertion are one DB transaction.
- Direct Idea writes are not exposed to browser/authenticated clients.
- Phase 7.1 introduces no Research Project, Idea Board, report/export, competitor-note, or ranking implementation.
- Phase 7.2 remains responsible for the live grounded OpenAI generator and generation API orchestration.
