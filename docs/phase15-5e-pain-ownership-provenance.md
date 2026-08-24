# Phase 15.5E — Pain Ownership / Source Provenance

## Status

Implementation calibration patch over `source-admission-v0.8`.

- Source Admission protocol version remains `source-admission-v0.8` for the current independent-audit pool.
- Policy revision: `source-admission-v0.8-pain-ownership-v0.1`
- Pain Ownership contract: `pain-ownership-v0.1`
- no external LLM/API calls
- no DB writes or migrations
- blind 120 remain excluded from development admission/audit

## Problem

A source can contain a real, concrete customer harm while still being the wrong evidence source.

Observed examples include legal/consulting publishers that reproduce victim complaints such as non-delivery, contact breakdown, refund refusal, or forced payment, then use those cases as consultation/lead-generation content.

The pain can be real while the source is secondary commercial packaging.

Therefore:

```text
Pain exists
!= Pain belongs to this author/source
!= admissible primary Problem Signal
```

## Ownership classes

### owned

The source contains explicit first-person ownership of the experience.

### reported

The source independently reports or warns about a problem without evidence that the publisher is commercially repackaging another person's complaint.

### borrowed_leadgen

The source has both:

1. professional lead-generation provenance such as a law firm, lawyer, legal consultation publisher, etc.; and
2. packaged third-party victim framing such as scam method, victim cases, damage structure, warning/countermeasure content.

`borrowed_leadgen` is rejected before warning/report promotion.

### unresolved

Ownership cannot be determined from admitted title/snippet provenance.

## Precision boundary

Content alone is not enough to classify borrowed pain.

A normal user, community, watchdog, or independent observer may legitimately publish a warning/report about a systemic problem. Those sources remain in the existing warning/report path.

The rejection requires publisher provenance + case packaging together.

## Invariant

```text
real victim story
+ secondary commercial/legal lead-gen repackaging
= REJECT as Source Signal
```

This does not assert that the underlying victim story is false. It asserts that the observed blog post is not the primary user complaint evidence Annoying Radar wants to admit.
