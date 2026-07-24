# Phase 5 Review Notes

## Design review

- Candidate and Problem Card remain one table; `status = confirmed` is the card boundary.
- Candidate editing is limited to `reviewing_candidates`.
- Merge, split, and Evidence movement are draft-only structural operations.
- Completion is atomic and requires at least one confirmed card with no unresolved drafts.
- Stored `evidence_count` is synchronized by database trigger and rechecked before completion.

## Independent review corrections

- Added active-Candidate Evidence overlap rejection at the DB trigger and completion boundary.
- Added singleton-source protection for move and split operations.
- Added deterministic row locking for two-Candidate operations.
- Preserved merged source records as discarded audit rows instead of deleting them.
- Added restore support while preventing edits to discarded Candidates.
- Kept all mutation RPCs inaccessible to anon/authenticated roles.
