# Phase 15.8O — Incident / Mechanism Curator Decision Packet

## Status

**IMPLEMENTED / AUTHORITATIVE PACKET NOT YET RUN**

Phase 15.8O prepares the exact Phase 15.8N closeout cohort for explicit human/curator Incident and problem-mechanism decisions without granting any persistence authority.

It is intentionally read-only.

---

## 1. Upstream authority

Phase 15.8M-B durable batch:

```text
phase15.8m-b-remainder-v0.1

82 outcomes
├─ Candidate          8
├─ Reject            66
└─ unresolved Review  8
```

Frozen Candidate fingerprint:

```text
aa33d9da6ca6940406fcc3f9faec6bb6a390f40741ce580897fb36f94a48b020
```

Phase 15.8N then performed an independent full-context Formation readiness audit over the exact Candidate 8 cohort.

Machine result:

```text
eligible            5
provenance_review   0
review               2
reject               1
```

Phase 15.8N closeout did not blindly accept all five machine-eligible Sources as downstream authority. Curator-oriented disposition was frozen as:

```text
strong_candidate          3
curator_reread_required   2
blocked_review            2
reject                    1
```

The strongest comparison proposal was two separate lodging reservation omission / confirmation / fulfillment incidents. A mobile port-out restriction case remained a strong singleton. Two machine-eligible surfaces were held for curator reread because informational/SEO/lead-generation interpretation remained plausible.

No Incident identity or problem signature was assigned by 15.8N.

---

## 2. Why 15.8O exists

Phase 15.6 established:

```text
Source Admission Candidate
≠ Formation-eligible evidence
≠ independent Incident
≠ repeated problem mechanism
≠ Canonical Problem
```

It also established that AI does not own Incident identity.

The current live database already contains four curator-authoritative Incidents and two published Public Problems. Some new Sources are semantically adjacent to existing lodging evidence, but adjacency is not identity.

Therefore 15.8O provides the curator enough context to decide:

```text
Is this Source usable evidence?
Is it a new Incident or the same Incident as an existing one?
Do two independent Incidents express the same problem mechanism?
If so, what stable problem_signature should later governed persistence use?
```

15.8O does not answer those questions itself.

---

## 3. Repository privacy boundary

The public repository does not permanently embed the eight Source UUIDs in the closeout disposition table.

`source-incident-curator-packet.mjs` stores only SHA-256 hashes of Source Signal IDs for the frozen 15.8N disposition map.

The actual UUIDs are joined only at live packet runtime from the authoritative database.

This preserves deterministic cohort identity without permanently publishing the internal Source-ID mapping in Git history.

---

## 4. Frozen comparison proposals

The packet contains two non-authoritative comparison prompts:

```text
lodging_reservation_fulfillment
  source count: 2
  purpose: compare as potentially independent incidents of
           lodging-intermediary reservation confirmation or fulfillment failure

mobile_portout_restriction
  source count: 1
  purpose: review as a strong singleton involving forced port-out restriction
           and discount clawback
```

These are curator aids only.

They are not:

```text
incident_key
problem_signature
repeat_eligible
Canonical Problem identity
```

---

## 5. Actionable reread scope

All eight Candidate Sources appear in the packet with their frozen disposition and durable M-B semantic facts.

Full public post context is re-fetched only for:

```text
strong_candidate          3
curator_reread_required   2
----------------------------
actionable reread total   5
```

The two blocked Review Sources and the Formation Reject do not receive another full-context fetch in this phase.

Cost boundary:

```text
public full-context fetches <= 5
paid external model calls    = 0
```

No model judgment occurs in 15.8O.

---

## 6. Existing authority snapshot

The live packet includes the current curator-authoritative:

```text
ar_source_incidents
ar_source_incident_links
ar_public_problems
ar_public_problem_evidence_snapshots
```

This lets a curator compare a new Source against existing Incident and Public Problem lineage before deciding whether an Incident should be reused or created.

The packet explicitly asserts that the new M-B Candidate cohort currently has:

```text
candidate Incident links = 0
```

If any Candidate has already acquired Incident authority before the packet run, 15.8O fails closed rather than silently producing a stale decision packet.

---

## 7. Blank decision template

The packet includes a structured decision template, but every authority-bearing field starts blank:

```text
source_decisions[*]
  evidence_decision      = null
  incident_action        = null
  existing_incident_id   = null
  new_incident_key       = null
  new_incident_label     = null
  notes                  = null

comparison_decisions[*]
  same_problem_mechanism = null
  problem_signature      = null
  notes                  = null

persistence_authorized   = false
```

The packet is therefore a decision surface, not a decision record.

---

## 8. Disposable artifact

Authoritative execution produces a one-day GitHub Actions artifact.

The artifact may contain public-source reread material required by the curator, including:

```text
Source Signal ID
public URL
author handle
title / timestamp
stored snippet
full post body for the five actionable Sources
M-B semantic facts
existing Incident authority
existing Public Problem authority
blank curator decision template
```

Those identities and bodies are intentionally not committed to the repository.

Workflow logs remain aggregate-only and do not emit individual Source IDs or full bodies.

Artifact authority:

```text
curator_decision_packet_not_a_decision
```

---

## 9. Database boundary

Phase 15.8O performs reads only.

Before and after packet generation it compares exact row counts for:

```text
ar_source_signals
ar_source_signal_observations
ar_source_ingestion_runs
ar_raw_inputs
ar_pain_evidences
ar_public_problems
ar_public_problem_evidence_snapshots
ar_source_incidents
ar_source_incident_links
ar_source_full_context_resolution_outcomes
```

Required result:

```text
all protected counts unchanged
database writes = 0
```

The runner contains no insert/upsert/update/delete/RPC path.

No migration is required.

---

## 10. Workflow and release flow

Workflow:

```text
.github/workflows/source-incident-curator-packet-15-8o.yml
```

Retained trigger after closeout:

```text
workflow_dispatch
```

Temporary one-shot implementation trigger:

```text
agent/phase15-8o-live-execution
```

The workflow always checks out authoritative `main`.

Release flow:

```text
implementation branch
→ contract tests
→ implementation PR
→ exact-head CI / PIE
→ merge to main
→ merged-main CI
→ independent DB preflight
→ move temporary live branch to exact main
→ authoritative read-only packet run
→ download and inspect one-day packet
→ independent DB zero-mutation readback
→ closeout PR removes temporary trigger
→ exact-head CI / PIE
→ merge closeout
→ merged-main CI
→ Phase 15.8O CLOSED
```

---

## 11. What remains unauthorized

Phase 15.8O does not authorize:

```text
ar_register_source_incident(...)
Source → Incident persistence
Incident creation
problem_signature persistence
repeated cluster persistence
Canonical Problem draft creation
Public Evidence mutation
publication
```

A later phase may consume explicit curator decisions, but only after those decisions exist as a separate governed authority.
