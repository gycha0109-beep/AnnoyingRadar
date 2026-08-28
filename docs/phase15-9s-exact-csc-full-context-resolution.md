# Phase 15.9S — Exact CSC Review Full-Context Resolution

## Status

**IMPLEMENTATION IN REVIEW / LIVE RESOLUTION NOT EXECUTED**

Phase 15.9R acquired 148 new Source Signals and surfaced four deterministic `review` rows. Read-only triage identified exactly one high-priority row directly describing a CSC-change / carrier dual-number service failure.

Phase 15.9S resolves only that frozen Source through the existing full-context fetch + semantic judge. It is read-only.

---

## 1. Exact target authority

The target is selected only by both sanitized immutable hashes:

```text
source_identity_sha256:
b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c

source_content_sha256:
db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4
```

No Source UUID is frozen into the public artifact and no `latest` inference exists.

Before network access the runner requires:

```text
exact hash pair resolves one Source
current Admission = review
requires_full_context = true
origin = naver_blog
content_scope = search_snippet
Blind evaluation membership = 0
existing full-context outcomes = 0
existing Incident links = 0
existing Public Evidence rows = 0
protected CSC Incident count = 1
```

---

## 2. Resolution authority

The runner reuses the existing governed resolver:

```text
resolveSourceAdmissionWithFullContext(...)
```

That path performs:

```text
Naver full-post fetch
→ structured semantic observation
→ deterministic final Admission resolution
```

The semantic model observes only:

```text
problem_claim
experience_actor
friction_cause
friction_specificity
pain_centrality
content_kind
evidence_quote
```

The model does not decide Formation eligibility, Incident identity, Public Problem identity, or publication.

Network budget is bounded to the single Source resolution path. The live workflow supplies the existing `OPENAI_SOURCE_FULL_CONTEXT_MODEL` authority.

---

## 3. Mutation boundary

Phase 15.9S is strictly read-only.

```text
database writes = 0
full-context outcome persistence = false
Formation persistence = false
Incident mutation = false
Public Problem mutation = false
publication = false
```

All governed table counts are snapshotted before and after resolution and must be byte-for-byte equivalent as a count map.

---

## 4. Artifact privacy

The one-day disposable artifact may include:

```text
sanitized Source identity/content hashes
resolution status / decision / reason codes
full-context content hash and character count
truncation status
semantic enum fields
hash + character count of the exact evidence quote
grounding boolean
model/provider name and token usage
aggregate DB count snapshot
```

It may not expose:

```text
Source UUID
canonical URL
author handle
stored snippet/raw text
full source body
raw evidence quote
provider request ID
Incident ID
curator decision ID
Public Problem ID
```

---

## 5. Live execution gate

The temporary live workflow can run only after:

```text
PR exact-head CI = SUCCESS
PIE = SUCCESS
expected-head merge = complete
merged-main CI = SUCCESS
```

It is a temporary `workflow_run` trigger restricted to successful `CI` push runs on `main` and checks out the exact `workflow_run.head_sha`.

The trigger must be removed in Phase 15.9S closeout.

---

## 6. Downstream interpretation

A `candidate` result is still not a durable outcome, Formation, Incident, or Public Problem.

If the live result is resolved `candidate`, a later persistence slice may append the exact full-context outcome after independently verifying the artifact hashes and current Source authority.

If the result is resolved `reject`, the second-Incident path stops for this Source.

If the result remains unresolved `review`, only a bounded technical/provider recovery path may continue; semantic uncertainty must not be rewritten as approval.
