# Phase 15.6D — Incident-aware Persistence

## Status

**CLOSED — 2026-08-24**

Phase 15.6D is implemented, merged, applied to the live Radar database, and empirically verified with the two Phase 15.6C Canonical Problem drafts.

No Problem was published by this phase.

## Purpose

Phase 15.6C produced exactly two curator-reviewable Canonical Problem drafts, but the previous Public Radar schema could not preserve the distinction between:

- one Source publication;
- one underlying real-world incident;
- one Public Evidence snapshot;
- one Canonical Public Problem.

The previous publication gate required two distinct `source_key` values. Phase 15.6A proved that two Source rows can still describe the same underlying incident, so source diversity cannot establish repeated occurrence.

## Persisted identity model

```text
ar_source_signals
      ↓ 1:1 source membership
ar_source_incident_links
      ↓
ar_source_incidents
      ↓ incident_id snapshot lineage
ar_public_problem_evidence_snapshots
      ↓
ar_public_problems
```

### Source identity

`source_signal_id` identifies one acquired Source Signal/publication.

### Incident identity

`incident_id` identifies one underlying real-world case. Multiple Source Signals may belong to one Incident, but one Source Signal cannot belong to more than one Incident.

Incident assignment is curator-authoritative. The persistence layer never invents incident identity.

## Publication gate

A Public Problem may be published only when all existing publication requirements still hold and:

```text
all Evidence snapshots have incident identity
AND at least 2 distinct incident_id values exist
```

`2 distinct source_key` remains an additional provenance-diversity requirement; it is no longer treated as proof of repetition.

For `external_public` Evidence, publication additionally verifies that the stored `source_signal_id` is actually linked to the stored `incident_id`.

## RPC boundaries

### `ar_register_source_incident`

Curator-only via `service_role`.

- creates or reuses one stable Incident;
- binds one or more existing Source Signals;
- rejects assignment of a Source Signal to a second Incident;
- performs no Problem creation or publication.

### `ar_add_incident_bound_public_problem_evidence`

Curator-only via `service_role`.

- accepts only an existing Source Signal ↔ Incident binding;
- writes an `external_public` Evidence snapshot carrying both identities;
- refuses Evidence edits to already-published Problems through the existing archive-before-edit boundary;
- does not publish.

Live privilege verification after migration:

```text
anon execute:          false
authenticated execute: false
service_role execute:  true
```

for the two new write RPCs.

## Compatibility boundary

The existing manual Evidence RPC remains present for compatibility. Evidence created without Incident identity is draft-only: the hardened publication gate rejects it.

This avoids silently changing current curator UI behavior while ensuring no incident-less Evidence can become public truth.

## Phase 15.6C integration

`lib/sources/canonical-problem-persistence.mjs` converts a ready 15.6C draft plus curator-confirmed Evidence identity into a deterministic persistence plan.

It requires:

- exact coverage of every Source Signal from the draft;
- no duplicate Source Signal Evidence rows;
- exact agreement with the draft Incident identities;
- at least two independent Incidents;
- at least two distinct Source keys.

The planner performs no network call, DB mutation, or publication.

## Live migration result

Applied migrations:

```text
030 incident_aware_public_problem_persistence
031 incident_persistence_fk_index_hardening
```

Pre-migration Public Radar state:

```text
Public Problems:            0
Public Evidence snapshots:  0
Source Signals:            830
```

There was therefore no existing Public Problem/Evidence backfill requirement.

The follow-up performance hardening:

- added covering indexes for `ar_source_incidents.created_by_user_id` and `ar_source_incident_links.linked_by_curator_user_id`;
- removed the redundant explicit Source-link index because `UNIQUE(source_signal_id)` already supplies the covering btree index.

Security review of the new incident tables reported only the expected `RLS enabled / no policy` INFO state. This is intentional deny-by-default: `public`, `anon`, and `authenticated` grants are revoked and the persistence path is service-role controlled.

## Empirical persistence closeout

The two Phase 15.6C drafts were persisted in one atomic transaction.

```text
Source Incidents:                 4
Source → Incident links:          5
Canonical Public Problems:        2
Public Evidence snapshots:        5
Published Public Problems:        0
Public feed rows:                  0
```

### Draft 1 — gym refund enforcement

```text
Evidence snapshots:        3
Distinct source_key:       3
Distinct incidents:        2
Missing Source identity:   0
Missing Incident identity: 0
Status:                    draft
published_at:              NULL
```

Two posts from the same refund dispute are persisted as one Incident, while the separate author's refund dispute is a second Incident.

This verifies the correction introduced by Phase 15.6:

```text
3 Source rows ≠ 3 repeated cases
3 Source rows = 2 independent incidents
```

### Draft 2 — lodging exception refund coordination

```text
Evidence snapshots:        2
Distinct source_key:       2
Distinct incidents:        2
Missing Source identity:   0
Missing Incident identity: 0
Status:                    draft
published_at:              NULL
```

The two lodging cases remain separate Incidents.

### Publication-readiness assertion

`ar_assert_public_problem_publishable()` was executed for both drafts inside the persistence transaction and succeeded.

This verifies only that the stored evidence now satisfies the structural publication gate. It does **not** constitute publication approval.

Neither draft was transitioned to `published`.

## Evidence handling boundary

Only short, exact contiguous excerpts verified during the Phase 15.6A full-context audit were persisted as Evidence snapshots.

Full source bodies were not written to Supabase or committed to the repository.

`source_observed_at` was left `NULL` in this closeout because the existing contract does not clearly establish whether it means source publication time or ingestion-observation time. Source identity is anchored by `source_signal_id`, canonical URL, and `source_key` instead of silently conflating those timestamps.

## Phase boundary

Phase 15.6D is closed.

Current authoritative state:

```text
669 development Source Signals
        ↓ Source Admission + selective resolution
17 admitted Candidates
        ↓ full-context Problem Formation
11 eligible Source rows
        ↓ incident dedupe
10 independent eligible incidents
        ↓ problem-mechanism clustering
2 repeated Problem clusters
        ↓ Canonical Problem Draft Gate
2 Canonical Problem drafts
        ↓ incident-aware persistence
2 persisted draft Problems
4 persisted Incidents
5 persisted Evidence snapshots
0 published Problems
0 public feed rows
```

The next authorized step is **Phase 15.6E — Curator Review / Publication Readiness**.

It must not automatically publish either draft. It should expose and verify the curator-facing review surface, incident lineage, evidence excerpts, and explicit publication action before any public transition is allowed.

## Boundaries preserved

- blind 120: untouched;
- full source bodies: not persisted;
- AI does not assign Incident identity;
- automatic publication: forbidden;
- published Problems: 0;
- production web deployment: not performed;
- no claim that structural publishability equals editorial approval.
