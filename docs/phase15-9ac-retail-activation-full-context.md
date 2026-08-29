# Phase 15.9AC — Retail Activation Full-Context Resolution

## Status

**IMPLEMENTATION IN REVIEW / LIVE READ-ONLY RESOLUTION NOT EXECUTED**

Phase 15.9AB deterministically triaged eight existing carrier provisioning / activation Sources. Exactly one Source remained `review + requires_full_context`: the `retail_activation_delay` family.

Phase 15.9AC performs one bounded read-only full-context semantic resolution for that exact canonical Source. It does not persist a durable outcome or Formation and does not mutate Incident or Public domains.

## Exact Source authority

```text
external_content_id = 7ff6763ae09d4d04952fe30e074a72952d155e6e5889573cb547947981c1bc89
canonical content_hash = 4ee142cf0651b03b1f146b3167493814b0546d8a450b96ca0ff90b482c65f7c0
source platform = naver_blog
source origin = naver_blog / blog.naver.com
content scope before = search_snippet
Admission = review
authority reason = title_truncated_complaint_ambiguous
requires_full_context = true
```

No latest-row inference is permitted. The target must still have zero durable full-context outcomes, Formation assessments, Incident links, Public Evidence, and Blind evaluation rows before live resolution.

## Resolution contract

Existing repository contracts are reused without modification:

```text
fetchSourceFullContext
→ Naver mobile PostView full_post extraction
→ resolveSourceAdmissionWithFullContext
→ source-full-context-semantic-v0.1
→ deterministic resolveFullContextSemantic
```

Budgets:

```text
Naver source requests <= 1
OpenAI semantic judge calls <= 1
database writes = 0
```

All governed table counts must remain byte-for-byte equivalent as count snapshots before and after the live resolution.

The artifact may expose only frozen Source/content hashes, context metadata/hashes, semantic enum facts, evidence quote hash/length/grounding, provider/model/usage metadata, and governed counts. It must not expose raw Source text, canonical URL, author handle, internal Source UUID, raw evidence quote, provider request ID, Incident UUID, curator UUID, or Public Problem UUID.

## Downstream boundary

A resolved `reject` closes this target without promotion.

A resolved `candidate` may proceed only through a later explicit durable outcome persistence phase and Formation assessment phase. Candidate status is not Incident approval.

If a later Formation becomes eligible and its mechanism is genuinely distinct from the existing `carrier_csc_feature_restriction_case`, creating a second Incident requires explicit human curator approval. Public Problem publication remains separately gated.
