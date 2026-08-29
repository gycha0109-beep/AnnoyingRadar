# Phase 15.9Y — Independent Carrier-Feature Full-Context Resolution

## Status

**CLOSED — LIVE ADMISSION REJECT / NO FULL-CONTEXT FETCH / NO DURABLE MUTATION**

Phase 15.9Y tested one exact, currently-unassigned carrier-feature Source as a possible second-Incident supply path. The live run correctly stopped at the deterministic Admission boundary before any source HTTP request or semantic model call.

The Public Problem promotion blocker remains unchanged:

```text
existing CSC Sources = 2
existing CSC Incidents = 1
minimum distinct Incidents required = 2
```

---

## 1. Exact target authority

```text
source identity SHA256 = 0a12063489fec74e1219ae11378f06867ea33938affd432f95b9a37c5dab36c3
source content SHA256  = b2f0cf6d42e8d8c9916f285883b690cf5b169069f8ce62cf3721697b49b00c66
source origin kind      = external_web
source origin host      = cuzred.tistory.com
```

Required baseline was independently confirmed before and after live execution:

```text
full-context outcomes = 0
Formation assessments = 0
Incident links = 0
Public Evidence rows = 0
```

No latest-row inference was used.

---

## 2. Live execution

Implementation PR:

```text
PR = #174
PR head = d6a0dc7ca68b0143a6ade160263a0bac654b7d0d
CI #557 = SUCCESS
PIE #170 = SUCCESS
implementation main = 35be972d79613e9b5d2e07b6da7178c720579e87
merged-main CI #558 = SUCCESS
```

Live workflow:

```text
run id = 33232331071
result = FAILURE at deterministic Admission assertion
artifact id = 9708867465
artifact digest = sha256:49e0bc7bd7cab1cd4cfaf66a6e3445a94ed463a32bc3358e610949dc951b0a85
```

The exact runtime result was:

```text
actual Admission decision = reject
expected by probe = review
```

The current deterministic policy explains the rejection: the target title contains the informational marker `해결`, while it does not satisfy the mixed information + experience recovery branch. Therefore it follows the `title_information_or_guide` rejection path.

Because the assertion occurs before `resolveSourceAdmissionWithFullContext(...)`:

```text
source HTTP requests = 0
semantic model calls = 0
database writes = 0
```

No full-context or semantic result exists for this Source.

---

## 3. Independent Supabase readback

Post-run governed counts remained:

```text
Source Signals = 3710
Source Observations = 4056
Source Ingestion Runs = 152
Raw Inputs = 10
Pain Evidences = 27
Full-context outcomes = 86
Formation assessments = 3
Source Incidents = 7
Source→Incident links = 9
Curator decisions = 2
Incident executions = 2
Public Problems = 3
Public Evidence = 7
Public Feed = 3
```

Target-specific rows remained:

```text
full-context outcomes = 0
Formation assessments = 0
Incident links = 0
Public Evidence rows = 0
```

---

## 4. Authority conclusion

The target is not eligible for durable outcome persistence under the current Admission authority.

It must not be promoted by forcing a full-context fetch or by overriding the deterministic rejection.

The existing governed Incident remains:

```text
incident_key = carrier_csc_feature_restriction_case
linked Sources = 2
Public Evidence rows = 0
```

Two Sources inside that Incident still count as one Incident for Public Problem publishability.

---

## 5. Closeout

The temporary `source-independent-carrier-feature-full-context-15-9y.yml` workflow is removed in this closeout so later main merges cannot retrigger the rejected probe.

The next candidate search must pre-exclude deterministic informational, commercial, positive-review, truncated-no-event, and other rejection branches before creating another live workflow.
