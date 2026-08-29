# Phase 15.9Y — Independent Carrier-Feature Full-Context Resolution

## Status

**IMPLEMENTATION IN REVIEW / LIVE READ-ONLY RESOLUTION NOT EXECUTED**

Phase 15.9X closed because its exact target was deterministically rejected before any network or model call.

The Public Problem promotion blocker remains:

```text
existing CSC Sources = 2
existing CSC Incidents = 1
minimum distinct Incidents required = 2
```

Phase 15.9Y evaluates a different, currently-unassigned Source describing an apparent carrier-specific feature restriction on an unlocked/self-purchased handset. It does not create a durable outcome, Formation, Incident, or Public Problem.

---

## 1. Exact target authority

The Source is selected only by the frozen pair:

```text
source identity SHA256 = 0a12063489fec74e1219ae11378f06867ea33938affd432f95b9a37c5dab36c3
source content SHA256  = b2f0cf6d42e8d8c9916f285883b690cf5b169069f8ce62cf3721697b49b00c66
```

Required durable baseline:

```text
content scope = search_snippet
full-context outcomes = 0
Formation assessments = 0
Incident links = 0
Public Evidence rows = 0
Blind evaluation rows = 0
```

No latest-row inference is allowed.

---

## 2. Deterministic Admission authority

Before any full-context network access, the Source must still resolve exactly as:

```text
decision = review
reason = title_explicit_complaint_requires_context
requires_full_context = true
```

This condition is asserted at runtime. Any policy drift or different classification aborts the phase before semantic promotion can occur.

---

## 3. External-web fetch authority

The exact Source resolves to:

```text
source origin kind = external_web
source origin host = cuzred.tistory.com
```

Phase 15.9Y explicitly opts only this exact Source into the existing bounded-public-HTML fetch policy. Existing SSRF, DNS, redirect, and size guards remain unchanged.

Bounded execution:

```text
source HTTP requests max = 4
semantic model calls max = 1
database writes = 0
```

---

## 4. Semantic authority

The existing full-context semantic resolver observes only:

```text
problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind
evidence_quote
```

The model cannot create or choose an Incident identity and cannot authorize Public Problem publication.

A `candidate` result only makes the Source eligible for a later durable outcome persistence phase.

---

## 5. Protected CSC baseline

The existing governed Incident remains:

```text
incident_key = carrier_csc_feature_restriction_case
linked Sources = 2
Public Evidence rows = 0
```

Phase 15.9Y must preserve this baseline exactly. The new Source is not linked to that Incident and is not treated as a second Incident merely because it appears semantically related.

---

## 6. Mutation boundary

Phase 15.9Y is read-only.

All governed table counts must remain equal before and after execution, including:

```text
Source / Observation / Ingestion
Raw Input / Pain Evidence
full-context outcomes
Formation assessments
Incidents / Source→Incident links
curator decisions / executions
Public Problems / Public Evidence / Public Feed
```

---

## 7. Next transition

Only a resolved full-context `candidate` may proceed to durable outcome persistence.

After durable outcome persistence, normal Formation assessment must run. Even if Formation is eligible, a second Incident identity requires a separate explicit human curator decision. Public Problem promotion remains blocked until two distinct governed Incidents exist and the canonical publishability gate passes.
