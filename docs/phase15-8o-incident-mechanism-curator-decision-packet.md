# Phase 15.8O — Incident / Mechanism Curator Decision Packet

## Status

**CLOSED — 2026-08-25**

Phase 15.8O produced and verified a strictly read-only curator decision packet over the exact Phase 15.8N closeout cohort.

The phase created no Incident identity, no problem signature, no Canonical Problem, no Public Evidence mutation, and no publication mutation.

The produced artifact is a decision surface only. All curator authority fields remain blank.

---

## 1. Implementation authority

Implementation PR:

```text
PR #101
exact head:
f6e4ed7ca653748971c49f89072e6bb208d5eee9

CI #388: SUCCESS
PIE #69: SUCCESS
```

Implementation merged to authoritative main as:

```text
5321d9ab2cbe18270d1abbd91f3d24e8a69bdd33
```

Merged-main verification:

```text
CI #389: SUCCESS
```

No migration was added.

---

## 2. Frozen upstream authority

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

Phase 15.8N Formation audit machine result:

```text
eligible            5
provenance_review   0
review               2
reject               1
```

Phase 15.8N closeout disposition:

```text
strong_candidate          3
curator_reread_required   2
blocked_review            2
reject                    1
```

Those dispositions are review planning authority, not Incident or Problem identity.

---

## 3. Repository privacy boundary

The public repository does not permanently embed the eight Source UUIDs in the Phase 15.8O disposition map.

`lib/sources/source-incident-curator-packet.mjs` stores only SHA-256 hashes of Source Signal IDs.

The actual Source UUIDs are joined only at runtime from the authoritative database and appear only in the disposable curator packet artifact.

This allows deterministic cohort verification without permanently publishing the internal Source-ID mapping in Git history.

---

## 4. Frozen curator comparison proposals

Two non-authoritative comparison aids were frozen:

```text
lodging_reservation_fulfillment
  expected source count: 2
  proposal:
  compare as potentially independent incidents of lodging-intermediary
  reservation confirmation or fulfillment failure

mobile_portout_restriction
  expected source count: 1
  proposal:
  review as a strong singleton involving forced port-out restriction
  and discount clawback
```

These are not:

```text
incident_key
incident_id
problem_signature
repeat_eligible
Canonical Problem identity
```

---

## 5. Actionable reread scope

All eight M-B Candidates appear in the packet.

Full public post context is re-fetched only for:

```text
strong_candidate          3
curator_reread_required   2
----------------------------
actionable reread total   5
```

The blocked Review 2 and Reject 1 do not receive another full-context fetch.

Observed execution boundary:

```text
public full-context fetches: 5
resolved actionable contexts: 5
paid external model calls: 0
```

No model judgment occurs in Phase 15.8O.

---

## 6. Existing authority snapshot

The packet includes current curator-authoritative snapshots of:

```text
ar_source_incidents
ar_source_incident_links
ar_public_problems
ar_public_problem_evidence_snapshots
```

Live packet state:

```text
existing Incidents:       4
existing Public Problems: 2
new Candidate links:      0
```

The existing lodging Incidents describe prior exception-cancellation/refund cases. They were not automatically reused for the new reservation-confirmation/fulfillment candidates.

Semantic adjacency is not Incident identity.

---

## 7. Blank curator decision authority

The packet contains decision rows only for the five actionable Sources.

Every authority-bearing field remained blank in the authoritative artifact:

```text
source_decisions: 5

for every source_decision:
  evidence_decision      = null
  incident_action        = null
  existing_incident_id   = null
  new_incident_key       = null
  new_incident_label     = null
  notes                  = null
```

The repeated-mechanism comparison template also remained blank:

```text
comparison_decisions: 1

same_problem_mechanism = null
problem_signature      = null
notes                  = null
```

Top-level persistence authority:

```text
persistence_authorized = false
```

Therefore:

```text
curator decisions completed = 0
Incident assignments        = 0
problem signatures assigned = 0
```

---

## 8. Authoritative packet execution

Authoritative workflow:

```text
Source Incident Curator Packet 15.8O
run: 32832843928
head SHA: 5321d9ab2cbe18270d1abbd91f3d24e8a69bdd33
conclusion: SUCCESS
```

Disposable artifact:

```text
artifact id: 9557433214
name: source-incident-curator-packet-15-8o
digest:
sha256:ad4f06492c91e6bafdf75f3863a02696c122e35a91eaa644b51683350dc1bbd8
retention: 1 day
```

Artifact authority:

```text
curator_decision_packet_not_a_decision
```

Artifact inspection confirmed:

```text
sources:                       8
actionable full contexts:      5
strong_candidate:              3
curator_reread_required:       2
blocked_review:                2
reject:                        1
existing Incidents:            4
existing Public Problems:      2
Candidate Incident links:      0
source decision rows:          5
comparison decision rows:      1
completed curator decisions:   0
```

The artifact contains public-source reread context needed by a curator, but those bodies/URLs/Source UUIDs are not committed to the repository.

Workflow logs remain aggregate-only.

---

## 9. Database zero-mutation verification

Preflight protected counts:

```text
ar_source_signals                         3245
ar_source_signal_observations             3537
ar_source_ingestion_runs                   132
ar_raw_inputs                                10
ar_pain_evidences                            27
ar_public_problems                            2
ar_public_problem_evidence_snapshots          5
ar_source_incidents                           4
ar_source_incident_links                      5
ar_source_full_context_resolution_outcomes   82
```

Independent post-run readback reproduced the exact same counts:

```text
3245 / 3537 / 132 / 10 / 27 / 2 / 5 / 4 / 5 / 82
```

Candidate Incident links remained:

```text
0
```

Result:

```text
DB mutations             = 0
Incident mutations       = 0
Public Problem mutations = 0
Public Evidence mutations= 0
Outcome mutations        = 0
```

---

## 10. Workflow closeout

The temporary autonomous trigger:

```text
agent/phase15-8o-live-execution
```

was used once to run the authoritative packet against exact main.

Closeout removes that push trigger.

Retained workflow trigger:

```text
workflow_dispatch
```

The retained workflow continues to check out authoritative `main` and remains read-only.

---

## 11. Phase closeout boundary

Phase 15.8O is closed when this closeout lands on main.

What 15.8O established:

```text
exact Candidate cohort identity          yes
N closeout dispositions                  yes
five-source curator reread packet        yes
existing Incident/Problem comparison     yes
blank structured decision template       yes
zero-mutation verification               yes
```

What it did not establish:

```text
which Sources become authoritative evidence
which Incident each Source belongs to
whether two Sources are independent Incidents
whether the lodging pair is one repeated problem mechanism
what problem_signature should be used
whether any new Canonical Problem should be persisted
```

Those remain explicit curator decisions.

---

## 12. Downstream authorization

The following remain **NOT AUTHORIZED** after Phase 15.8O:

```text
ar_register_source_incident(...)
Source → Incident persistence
Incident creation
Incident reuse for the new cohort
problem_signature persistence
repeated cluster persistence
Canonical Problem draft creation
Public Evidence mutation
publication
```

The next governed phase must begin from explicit curator decisions, not from the non-authoritative comparison proposals in this packet.
