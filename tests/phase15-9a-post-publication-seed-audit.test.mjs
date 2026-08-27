import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  matchesPublicCategory,
  PUBLIC_CATEGORY_CHIPS,
  publicCategoryLabel,
} from "../lib/radar/public-category.mjs";
import {
  PHASE15_9A_ACQUISITION_FOCUS,
  PHASE15_9A_PRIMARY_SEED,
} from "../lib/sources/phase15-9a-seed-authority.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9A separates UI category vocabulary from internal Public Problem categories", () => {
  assert.deepEqual(PUBLIC_CATEGORY_CHIPS, ["배달", "취업", "운동", "금융", "쇼핑", "여행"]);

  const lodging = { category: "travel_booking", title: "숙소 예약 문제", summary: "예약이 반영되지 않았다" };
  assert.equal(matchesPublicCategory(lodging, "여행"), true);
  assert.equal(publicCategoryLabel(lodging), "여행");

  const gym = { category: "consumer_refund", title: "헬스장 환불 지연", summary: "환불이 장기화됐다" };
  assert.equal(matchesPublicCategory(gym, "운동"), true);
  assert.equal(publicCategoryLabel(gym), "운동");
});

test("15.9A freezes the curator-held singleton only as acquisition seed", () => {
  assert.equal(PHASE15_9A_PRIMARY_SEED.curator_state, "evidence_accept_incident_hold_singleton");
  assert.match(PHASE15_9A_PRIMARY_SEED.source_identity_sha256, /^[0-9a-f]{64}$/);
  assert.match(PHASE15_9A_PRIMARY_SEED.source_content_sha256, /^[0-9a-f]{64}$/);
  assert.equal(PHASE15_9A_ACQUISITION_FOCUS.authority, "search_focus_not_problem_signature");
  assert.ok(PHASE15_9A_ACQUISITION_FOCUS.query_terms.length >= 4);
});

test("15.9A seed audit is read-only and does not authorize Incident or Problem creation", async () => {
  const script = await read("scripts/run-post-publication-seed-audit-15-9a.mjs");
  assert.match(script, /database_writes: 0/);
  assert.match(script, /incident_creation_authorized: false/);
  assert.match(script, /problem_signature_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.doesNotMatch(script, /ar_register_source_incident/);
  assert.doesNotMatch(script, /ar_set_public_problem_status/);
});

test("15.9A public surface smoke checks Explore, category, detail, Evidence and source links", async () => {
  const smoke = await read("scripts/run-public-radar-post-publication-smoke-15-9a.mjs");
  assert.match(smoke, /PUBLIC_RADAR_POST_PUBLICATION_SMOKE_PASS/);
  assert.match(smoke, /여행 문제 더 보기/);
  assert.match(smoke, /figure\.radar-evidence-card/);
  assert.match(smoke, /원문 보기/);
  assert.match(smoke, /travel_booking/);
  assert.match(smoke, /source_signal_id/);
  assert.match(smoke, /browser_page_errors: 0/);
});
