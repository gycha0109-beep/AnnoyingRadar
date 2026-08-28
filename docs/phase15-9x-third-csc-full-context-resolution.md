# Phase 15.9X — Third CSC Source Full-Context Resolution

## Status

**IMPLEMENTATION IN REVIEW / LIVE READ-ONLY RESOLUTION NOT EXECUTED**

Phase 15.9W closed with two independent Source Signals linked to one internal Incident:

```text
incident_key = carrier_csc_feature_restriction_case
Source count = 2
Incident count for this mechanism = 1
Public Evidence = 0
Public Problem = 0
```

The Public Problem architecture requires repeated support from at least two **distinct Incident identities**. Two Source Signals inside one Incident do not satisfy that gate.

Phase 15.9X therefore does not create a Public Problem. It evaluates one already-acquired, currently-unassigned third CSC-related Source that may represent a separate real-world episode.

---

## 1. Exact target authority

The Source is selected only by the frozen pair:

```text
source identity SHA256 = 60ca0eebb603aa22bad4f73f31d275d7f37af13b20da5499ca0a041d26c56818
source content SHA256  = a1b35603bfd16782a77edf0b5dba3488e1fc03bf550bb24e4733c8ca0f4d1fc6
```

Current durable state must remain:

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

## 2. External-web fetch authority

Although the Source was acquired through the Naver blog-search provider, its canonical origin resolves to:

```text
source origin kind = external_web
source origin host = conetrue.tistory.com
```

The generic full-context fetcher intentionally blocks external-web body retrieval unless the caller explicitly supplies:

```text
bounded_public_html
```

Phase 15.9X supplies that policy only for this exact Source. Existing SSRF/DNS/redirect/content-size guards remain unchanged.

Bounded execution:

```text
source HTTP requests max = 4
semantic model calls max = 1
database writes = 0
```

---

## 3. Semantic authority

The existing deterministic Admission policy remains first authority.

If the Source is `review + requires_full_context`, the existing selective full-context semantic resolver observes:

```text
problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind
evidence_quote
```

The model does not decide Incident identity, Public Problem identity, or publication.

If the deterministic Admission policy does not require full context, the phase records that result without overriding it.

---

## 4. Promotion blocker

Before this phase:

```text
existing CSC Sources = 2
existing CSC Incidents = 1
minimum distinct Incidents required for repeated Public Problem support = 2
```

Therefore:

```text
Public Problem draft ready = false
blocking reason = distinct_incident_support_missing
```

Phase 15.9X may only discover whether the exact third Source is suitable for the next durable Source/Formation path. It cannot reinterpret two Sources in one Incident as two Incidents.

---

## 5. Mutation boundary

Phase 15.9X is read-only.

All governed counts must remain byte-for-byte equivalent before and after execution, including:

```text
Source / Observation / Ingestion
Raw Input / Pain Evidence
full-context outcomes
Formation assessments
Incidents / Source→Incident links
curator decisions / executions
Public Problems / Public Evidence / Public Feed
```

No durable outcome, Formation, Incident, Public Problem, Public Evidence, feed, or publication mutation is authorized.

---

## 6. Next transition

Only if the exact Source resolves as a full-context `candidate` may a later phase persist that outcome.

A later eligible Formation would still not establish a second Incident automatically. A separate explicit human curator decision would be required to create a new Incident identity for the separate episode.
