import { createHash } from "node:crypto";

import { PHASE15_9D_REJECTION_STRATA } from "./phase15-9d-rejection-diagnostics.mjs";

export const PHASE15_9F_VERSION = "phase15.9f-external-web-full-context-v0.1";
export const PHASE15_9F_PER_STRATUM = 4;
export const PHASE15_9F_SAMPLE_SIZE = PHASE15_9D_REJECTION_STRATA.length * PHASE15_9F_PER_STRATUM;

function stableHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function selectPhase15_9FExternalPilot(records) {
  const selected = [];
  for (const reason of PHASE15_9D_REJECTION_STRATA) {
    const bucket = (records ?? [])
      .filter((record) => record.admission?.decision === "reject"
        && record.admission?.reason_codes?.[0] === reason
        && record.origin?.kind === "external_web")
      .sort((left, right) => {
        const leftIdentity = left.signal.external_content_id ?? left.signal.id;
        const rightIdentity = right.signal.external_content_id ?? right.signal.id;
        const leftHash = stableHash(`${PHASE15_9F_VERSION}:${reason}:${leftIdentity}`);
        const rightHash = stableHash(`${PHASE15_9F_VERSION}:${reason}:${rightIdentity}`);
        if (leftHash !== rightHash) return leftHash.localeCompare(rightHash);
        return String(leftIdentity).localeCompare(String(rightIdentity));
      });
    if (bucket.length < PHASE15_9F_PER_STRATUM) {
      throw new Error(`Phase 15.9F stratum ${reason} has ${bucket.length} external Sources; requires ${PHASE15_9F_PER_STRATUM}`);
    }
    selected.push(...bucket.slice(0, PHASE15_9F_PER_STRATUM));
  }

  if (selected.length !== PHASE15_9F_SAMPLE_SIZE) {
    throw new Error(`Phase 15.9F selected ${selected.length}; expected ${PHASE15_9F_SAMPLE_SIZE}`);
  }
  if (new Set(selected.map((record) => record.signal.id)).size !== selected.length) {
    throw new Error("Phase 15.9F sample must contain distinct Source Signals");
  }
  return selected;
}

export function summarizePhase15_9F(results) {
  const summary = {
    total: results.length,
    resolved: 0,
    unavailable: 0,
    truncated: 0,
    extraction_scopes: {},
    error_codes: {},
  };
  for (const result of results) {
    if (result.fetch_status === "resolved") summary.resolved += 1;
    else summary.unavailable += 1;
    if (result.truncated) summary.truncated += 1;
    if (result.extraction_scope) {
      summary.extraction_scopes[result.extraction_scope] = (summary.extraction_scopes[result.extraction_scope] ?? 0) + 1;
    }
    if (result.error_code) {
      summary.error_codes[result.error_code] = (summary.error_codes[result.error_code] ?? 0) + 1;
    }
  }
  return summary;
}
