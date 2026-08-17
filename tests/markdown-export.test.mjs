import assert from "node:assert/strict";
import test from "node:test";

import {
  ideaCandidateExportFilename,
  markdownAttachmentHeaders,
  problemCardExportFilename,
  renderIdeaCandidateMarkdown,
  renderProblemCardMarkdown,
  renderResearchProjectMarkdown,
  researchProjectExportFilename,
} from "../lib/exports/markdown.mjs";

const evidenceA = {
  id: "e-a",
  original_text: "첫 번째 # 원문",
  summary_ko: "요약 A",
  pain_type: "friction",
  target_user: "user A",
  situation: "situation A",
  sentiment_level: "negative",
  intensity_level: "high",
  source_type: "manual",
  source_url: "https://example.com/a",
  source_memo: "memo A",
  status: "confirmed",
  order_index: 1,
  created_at: "2026-01-01T00:00:00.000Z",
};

const evidenceB = {
  ...evidenceA,
  id: "e-b",
  original_text: "두 번째 원문",
  summary_ko: "요약 B",
  order_index: 2,
  created_at: "2026-01-02T00:00:00.000Z",
};

const problem = {
  id: "p-1",
  raw_input_id: "r-1",
  title: "Problem #1",
  summary: "문제 *요약*",
  target_user: "대상 사용자",
  situation: "상황",
  evidence_count: 2,
  intensity_level: "high",
  repeat_pattern_level: "repeated",
  clarity_level: "clear",
  status: "confirmed",
};

const idea = {
  id: "i-1",
  problem_candidate_id: "p-1",
  generation_batch_id: "b-1",
  title: "Idea [A]",
  one_liner: "한 줄 아이디어",
  target_user: "대상",
  problem_statement: "문제 정의",
  core_value: "핵심 가치",
  first_build_scope: "첫 구현",
  excluded_scope: "제외",
  implementation_difficulty: "medium",
  monetization_hint: "수익 힌트",
  first_screen_idea: "첫 화면",
  status: "researching",
  memo: "메모",
  order_index: 0,
  created_at: "2026-01-03T00:00:00.000Z",
};

test("Problem Card Markdown export is deterministic and orders canonical children stably", () => {
  const payload = {
    raw_input: { id: "r-1", analysis_status: "completed" },
    problem_card: { ...problem, evidences: [evidenceB, evidenceA] },
    evidences: [evidenceB, evidenceA],
    saved_problem: { status: "active", category: "workflow", memo: "saved memo" },
    alternatives: [
      { id: "n-2", kind: "service", name: "Z service", url: null, note: "Z" },
      { id: "n-1", kind: "alternative", name: "A alternative", url: "https://example.com", note: "A" },
    ],
    idea_candidates: [idea],
    projects: [
      {
        created_at: "2026-01-05T00:00:00.000Z",
        project: { id: "pr-1", title: "Project", status: "active", purpose: "Purpose" },
      },
    ],
  };

  const first = renderProblemCardMarkdown(payload);
  const second = renderProblemCardMarkdown({ ...payload, evidences: [evidenceA, evidenceB] });
  assert.equal(first, second);
  assert.ok(first.indexOf("Evidence 1") < first.indexOf("Evidence 2"));
  assert.ok(first.indexOf("e-a") < first.indexOf("e-b"));
  assert.match(first, /## Existing Services \/ Alternatives/);
  assert.match(first, /## Idea Candidates/);
  assert.match(first, /## Research Projects/);
  assert.doesNotMatch(first, /generated_at|exported_at/i);
  assert.match(first, /Problem \\#1/);
  assert.match(first, /문제 \\\*요약\\\*/);
});

test("Idea Candidate Markdown export includes source provenance without runtime-generated metadata", () => {
  const markdown = renderIdeaCandidateMarkdown({
    idea,
    problem_card: problem,
    evidences: [evidenceA],
    source_problem_alternatives: [],
    generation_batch: {
      id: "b-1",
      model: "model-x",
      prompt_version: "v1",
      provider_request_id: "req-1",
      generation_input_tokens: 10,
      generation_output_tokens: 20,
    },
    status_events: [
      { id: "s-1", from_status: "candidate", to_status: "researching", created_at: "2026-01-04T00:00:00.000Z" },
    ],
    projects: [],
  });

  assert.match(markdown, /^# Idea Candidate:/);
  assert.match(markdown, /## Source Problem Card/);
  assert.match(markdown, /## Generation Provenance/);
  assert.match(markdown, /## Status History/);
  assert.doesNotMatch(markdown, /generated_at|exported_at/i);
});

test("Research Project Markdown export includes linked problems, saved context, alternatives and ideas", () => {
  const markdown = renderResearchProjectMarkdown({
    project: { id: "pr-1", title: "Research Project", purpose: "Purpose", status: "active" },
    linked_problems: [
      {
        project_id: "pr-1",
        problem_candidate_id: "p-1",
        created_at: "2026-01-01T00:00:00.000Z",
        problem_card: problem,
        saved_problem: { category: "workflow", status: "active", memo: "saved" },
      },
    ],
    linked_ideas: [
      {
        project_id: "pr-1",
        idea_candidate_id: "i-1",
        created_at: "2026-01-02T00:00:00.000Z",
        idea,
        problem_card: problem,
      },
    ],
    problem_alternatives: [
      {
        problem_candidate_id: "p-1",
        notes: [{ id: "n-1", kind: "service", name: "Service", url: null, note: "note" }],
      },
    ],
  });

  assert.match(markdown, /^# Research Project:/);
  assert.match(markdown, /## Linked Problems/);
  assert.match(markdown, /#### Existing Services \/ Alternatives/);
  assert.match(markdown, /## Linked Ideas/);
  assert.doesNotMatch(markdown, /generated_at|exported_at/i);
});

test("Markdown attachment filenames and headers are stable and private", () => {
  assert.equal(problemCardExportFilename("p-1"), "problem-card-p-1.md");
  assert.equal(ideaCandidateExportFilename("i-1"), "idea-candidate-i-1.md");
  assert.equal(researchProjectExportFilename("pr-1"), "research-project-pr-1.md");
  assert.deepEqual(markdownAttachmentHeaders("problem-card-p-1.md"), {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": 'attachment; filename="problem-card-p-1.md"',
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  });
});
