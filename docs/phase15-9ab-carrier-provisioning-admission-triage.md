# Phase 15.9AB — Carrier Provisioning Admission Triage

## Status

**IMPLEMENTATION IN REVIEW / LIVE READ-ONLY TRIAGE NOT EXECUTED**

Phase 15.9AA closed credential-blocked with zero Threads acquisition writes. Phase 15.9F authority review also confirms that `external-web` is a full-context fetch path for already-acquired Sources, not an arbitrary discovery/intake mechanism.

Before launching another Naver campaign, current canonical Source inventory contains several unassigned carrier provisioning / activation friction matches. Phase 15.9AB evaluates exactly eight of those existing Sources under the current deterministic Admission authority.

The Public Problem blocker remains:

```text
existing CSC linked Sources = 2
existing CSC Incidents = 1
minimum distinct Incidents required = 2
Public Problem draft ready = false
blocking reason = distinct_incident_support_missing
```

---

## 1. Exact Source authority

The runner binds eight frozen `(external_content_id, content_hash)` pairs. They represent retrieval families only:

```text
self_purchased_sim_activation
imported_esim_activation
retail_activation_delay
device_change_activation_gap
network_registration_failure
post_activation_service_loss
imei_activation_mismatch
sim_replacement_recognition
```

Each exact Source must resolve uniquely and must have zero:

```text
full-context outcomes
Formation assessments
Incident links
Public Evidence rows
```

No latest-row inference is permitted.

---

## 2. Admission authority

The only classification executed is the existing repository function:

```text
classifySourceAdmission(signal)
```

Phase 15.9AB does not modify Admission policy and does not override a reject result based on manual relevance judgments.

The artifact records only deterministic decision, reason codes, full-context requirement, published timestamp, and frozen Source/content hashes.

No raw Source text, URL, author, internal Source UUID, Incident UUID, curator identity, or Public Problem identity is exported.

---

## 3. Mutation boundary

Phase 15.9AB is strictly read-only.

Budgets:

```text
source network requests = 0
model calls = 0
database writes = 0
```

All governed counts must remain equal before and after execution:

```text
Source / Observation / Ingestion
Raw Input / Pain Evidence
full-context outcomes
Formation assessments
Incidents / Source→Incident links
curator decisions / executions
Public Problems / Public Evidence / Public Feed
```

The existing `carrier_csc_feature_restriction_case` baseline must remain exactly one Incident with two linked Sources and zero Public Evidence.

---

## 4. Next transition

If every target is deterministically rejected, the next slice may run a new bounded Naver acquisition with a different provisioning/activation retrieval taxonomy.

If one or more targets are `review + requires_full_context`, a later exact Source phase may perform bounded full-context semantic resolution for the strongest mechanism-relevant target.

If a target is directly `candidate`, only the normal durable outcome → Formation path may proceed.

Even an eligible Formation does not create a second Incident automatically. A semantically distinct Incident identity still requires an explicit human curator decision. Public Problem publication remains separately gated.
