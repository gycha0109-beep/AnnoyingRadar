# Phase 15.6D — Incident-aware Persistence

## Status

IMPLEMENTED — pending merge/database application

## Purpose

Phase 15.6C produced exactly two curator-reviewable Canonical Problem drafts, but the existing Public Radar schema could not preserve the distinction between:

- one Source publication;
- one underlying real-world incident;
- one Public Evidence snapshot;
- one Canonical Public Problem.

The previous publication gate required two distinct `source_key` values. Phase 15.6A proved that two Source rows can still describe the same underlying incident, so source diversity cannot establish repeated occurrence.

## New persisted identity model

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

## New RPC boundaries

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

## Current database precondition

Before this migration, the live Radar database contains:

```text
Public Problems: 0
Public Evidence snapshots: 0
Source Signals: 830
```

Therefore no existing Public Problem/Evidence data requires incident backfill.

## Boundaries

- blind 120: untouched;
- full source bodies: not persisted;
- AI does not assign Incident identity;
- automatic publication: forbidden;
- production web deployment: not required by this phase;
- migration application and current two-draft persistence occur only after repository CI succeeds.
