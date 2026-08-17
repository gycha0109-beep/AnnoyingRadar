function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r\n?/g, "\n").trim();
}

function escapeInline(value) {
  return normalizeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_\[\]<>#|])/g, "\\$1")
    .replace(/\n+/g, " ");
}

function valueOrDash(value) {
  const normalized = escapeInline(value);
  return normalized || "-";
}

function quoteBlock(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "_없음_";
  return normalized
    .split("\n")
    .map((line) => `> ${escapeInline(line) || " "}`)
    .join("\n");
}

function comparePrimitive(left, right) {
  const a = left === null || left === undefined ? "" : String(left);
  const b = right === null || right === undefined ? "" : String(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function stableSort(rows, selectors) {
  return [...(rows ?? [])].sort((left, right) => {
    for (const selector of selectors) {
      const result = comparePrimitive(selector(left), selector(right));
      if (result !== 0) return result;
    }
    return 0;
  });
}

function orderIndex(value) {
  return Number.isInteger(value) ? String(value).padStart(12, "0") : "999999999999";
}

function pushTextSection(lines, title, value) {
  lines.push(`## ${title}`, "", quoteBlock(value), "");
}

function pushProblemMetrics(lines, problemCard, level = 2) {
  const heading = "#".repeat(level);
  lines.push(`${heading} Evidence Metrics`, "");
  lines.push(`- Evidence Count: ${valueOrDash(problemCard?.evidence_count)}`);
  lines.push(`- Intensity: ${valueOrDash(problemCard?.intensity_level)}`);
  lines.push(`- Repeat Pattern: ${valueOrDash(problemCard?.repeat_pattern_level)}`);
  lines.push(`- Clarity: ${valueOrDash(problemCard?.clarity_level)}`, "");
}

function pushEvidence(lines, evidences, level = 2) {
  const heading = "#".repeat(level);
  const childHeading = "#".repeat(level + 1);
  const rows = stableSort(evidences, [
    (item) => orderIndex(item.order_index),
    (item) => item.created_at,
    (item) => item.id,
  ]);

  lines.push(`${heading} Evidence`, "");
  if (!rows.length) {
    lines.push("_연결된 Evidence 없음_", "");
    return;
  }

  rows.forEach((evidence, index) => {
    lines.push(`${childHeading} Evidence ${index + 1}`, "");
    lines.push(`- ID: ${valueOrDash(evidence.id)}`);
    lines.push(`- Status: ${valueOrDash(evidence.status)}`);
    lines.push(`- Pain Type: ${valueOrDash(evidence.pain_type)}`);
    lines.push(`- Target User: ${valueOrDash(evidence.target_user)}`);
    lines.push(`- Situation: ${valueOrDash(evidence.situation)}`);
    lines.push(`- Sentiment: ${valueOrDash(evidence.sentiment_level)}`);
    lines.push(`- Intensity: ${valueOrDash(evidence.intensity_level)}`);
    lines.push(`- Source Type: ${valueOrDash(evidence.source_type)}`);
    lines.push(`- Source URL: ${valueOrDash(evidence.source_url)}`);
    lines.push(`- Source Memo: ${valueOrDash(evidence.source_memo)}`, "");
    lines.push(`${childHeading}# Original`, "", quoteBlock(evidence.original_text), "");
    lines.push(`${childHeading}# Korean Summary`, "", quoteBlock(evidence.summary_ko), "");
  });
}

function pushAlternatives(lines, alternatives, level = 2) {
  const heading = "#".repeat(level);
  const childHeading = "#".repeat(level + 1);
  const rows = stableSort(alternatives, [
    (item) => item.kind,
    (item) => item.name,
    (item) => item.id,
  ]);

  lines.push(`${heading} Existing Services / Alternatives`, "");
  if (!rows.length) {
    lines.push("_기록된 서비스/대안 없음_", "");
    return;
  }

  for (const item of rows) {
    lines.push(`${childHeading} ${valueOrDash(item.name)}`, "");
    lines.push(`- Kind: ${valueOrDash(item.kind)}`);
    lines.push(`- URL: ${valueOrDash(item.url)}`);
    lines.push(`- ID: ${valueOrDash(item.id)}`, "");
    lines.push(quoteBlock(item.note), "");
  }
}

function pushIdeaCore(lines, idea, level = 2) {
  const heading = "#".repeat(level);
  lines.push(`${heading} ${valueOrDash(idea?.title)}`, "");
  lines.push(`- ID: ${valueOrDash(idea?.id)}`);
  lines.push(`- Status: ${valueOrDash(idea?.status)}`);
  lines.push(`- Implementation Difficulty: ${valueOrDash(idea?.implementation_difficulty)}`);
  lines.push(`- Generation Batch ID: ${valueOrDash(idea?.generation_batch_id)}`, "");
  const fields = [
    ["One-liner", idea?.one_liner],
    ["Target User", idea?.target_user],
    ["Problem Statement", idea?.problem_statement],
    ["Core Value", idea?.core_value],
    ["First Build Scope", idea?.first_build_scope],
    ["Excluded Scope", idea?.excluded_scope],
    ["Monetization Hint", idea?.monetization_hint],
    ["First Screen Idea", idea?.first_screen_idea],
    ["Memo", idea?.memo],
  ];
  for (const [label, value] of fields) {
    lines.push(`${heading}# ${label}`, "", quoteBlock(value), "");
  }
}

function finalize(lines) {
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function problemCardExportFilename(problemCandidateId) {
  return `problem-card-${String(problemCandidateId)}.md`;
}

export function ideaCandidateExportFilename(ideaId) {
  return `idea-candidate-${String(ideaId)}.md`;
}

export function researchProjectExportFilename(projectId) {
  return `research-project-${String(projectId)}.md`;
}

export function markdownAttachmentHeaders(filename) {
  return {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}

export function renderProblemCardMarkdown(payload) {
  const problemCard = payload.problem_card;
  const lines = [
    `# Problem Card: ${valueOrDash(problemCard?.title)}`,
    "",
    `- ID: ${valueOrDash(problemCard?.id)}`,
    `- Status: ${valueOrDash(problemCard?.status)}`,
    `- Source Raw Input ID: ${valueOrDash(problemCard?.raw_input_id)}`,
    `- Source Analysis Status: ${valueOrDash(payload.raw_input?.analysis_status)}`,
    "",
  ];

  pushTextSection(lines, "Summary", problemCard?.summary);
  pushTextSection(lines, "Target User", problemCard?.target_user);
  pushTextSection(lines, "Situation", problemCard?.situation);
  pushProblemMetrics(lines, problemCard);

  lines.push("## Saved Problem", "");
  if (payload.saved_problem) {
    lines.push(`- Status: ${valueOrDash(payload.saved_problem.status)}`);
    lines.push(`- Category: ${valueOrDash(payload.saved_problem.category)}`, "");
    lines.push(quoteBlock(payload.saved_problem.memo), "");
  } else {
    lines.push("_Saved Problem으로 저장되지 않음_", "");
  }

  pushEvidence(lines, payload.evidences);
  pushAlternatives(lines, payload.alternatives);

  const ideas = stableSort(payload.idea_candidates, [
    (item) => orderIndex(item.order_index),
    (item) => item.created_at,
    (item) => item.id,
  ]);
  lines.push("## Idea Candidates", "");
  if (!ideas.length) lines.push("_연결된 Idea Candidate 없음_", "");
  for (const idea of ideas) pushIdeaCore(lines, idea, 3);

  const projects = stableSort(payload.projects, [
    (item) => item.created_at,
    (item) => item.project?.id,
  ]);
  lines.push("## Research Projects", "");
  if (!projects.length) lines.push("_연결된 Research Project 없음_", "");
  for (const membership of projects) {
    lines.push(`### ${valueOrDash(membership.project?.title)}`, "");
    lines.push(`- Project ID: ${valueOrDash(membership.project?.id)}`);
    lines.push(`- Status: ${valueOrDash(membership.project?.status)}`, "");
    lines.push(quoteBlock(membership.project?.purpose), "");
  }

  return finalize(lines);
}

export function renderIdeaCandidateMarkdown(payload) {
  const idea = payload.idea;
  const problemCard = payload.problem_card;
  const lines = [
    `# Idea Candidate: ${valueOrDash(idea?.title)}`,
    "",
  ];
  pushIdeaCore(lines, idea, 2);

  lines.push("## Source Problem Card", "");
  if (problemCard) {
    lines.push(`- ID: ${valueOrDash(problemCard.id)}`);
    lines.push(`- Title: ${valueOrDash(problemCard.title)}`);
    lines.push(`- Status: ${valueOrDash(problemCard.status)}`, "");
    lines.push("### Summary", "", quoteBlock(problemCard.summary), "");
    lines.push("### Target User", "", quoteBlock(problemCard.target_user), "");
    lines.push("### Situation", "", quoteBlock(problemCard.situation), "");
    pushProblemMetrics(lines, problemCard, 3);
  } else {
    lines.push("_Source Problem Card 없음_", "");
  }

  pushEvidence(lines, payload.evidences);
  pushAlternatives(lines, payload.source_problem_alternatives);

  lines.push("## Generation Provenance", "");
  const batch = payload.generation_batch;
  if (batch) {
    lines.push(`- Batch ID: ${valueOrDash(batch.id)}`);
    lines.push(`- Model: ${valueOrDash(batch.model)}`);
    lines.push(`- Prompt Version: ${valueOrDash(batch.prompt_version)}`);
    lines.push(`- Provider Request ID: ${valueOrDash(batch.provider_request_id)}`);
    lines.push(`- Input Tokens: ${valueOrDash(batch.generation_input_tokens)}`);
    lines.push(`- Output Tokens: ${valueOrDash(batch.generation_output_tokens)}`, "");
  } else {
    lines.push("_Generation Batch 없음_", "");
  }

  const events = stableSort(payload.status_events, [
    (item) => item.created_at,
    (item) => item.id,
  ]);
  lines.push("## Status History", "");
  if (!events.length) lines.push("_Status event 없음_", "");
  for (const event of events) {
    lines.push(`- ${valueOrDash(event.created_at)}: ${valueOrDash(event.from_status)} -> ${valueOrDash(event.to_status)} (${valueOrDash(event.id)})`);
  }
  if (events.length) lines.push("");

  const projects = stableSort(payload.projects, [
    (item) => item.created_at,
    (item) => item.project?.id,
  ]);
  lines.push("## Research Projects", "");
  if (!projects.length) lines.push("_연결된 Research Project 없음_", "");
  for (const membership of projects) {
    lines.push(`### ${valueOrDash(membership.project?.title)}`, "");
    lines.push(`- Project ID: ${valueOrDash(membership.project?.id)}`);
    lines.push(`- Status: ${valueOrDash(membership.project?.status)}`, "");
    lines.push(quoteBlock(membership.project?.purpose), "");
  }

  return finalize(lines);
}

export function renderResearchProjectMarkdown(payload) {
  const project = payload.project;
  const lines = [
    `# Research Project: ${valueOrDash(project?.title)}`,
    "",
    `- ID: ${valueOrDash(project?.id)}`,
    `- Status: ${valueOrDash(project?.status)}`,
    "",
    "## Purpose",
    "",
    quoteBlock(project?.purpose),
    "",
  ];

  const alternativesByProblem = new Map(
    (payload.problem_alternatives ?? []).map((item) => [item.problem_candidate_id, item.notes ?? []]),
  );
  const linkedProblems = stableSort(payload.linked_problems, [
    (item) => item.created_at,
    (item) => item.problem_candidate_id,
  ]);
  lines.push("## Linked Problems", "");
  if (!linkedProblems.length) lines.push("_연결된 Problem Card 없음_", "");
  for (const link of linkedProblems) {
    const problemCard = link.problem_card;
    lines.push(`### ${valueOrDash(problemCard?.title)}`, "");
    lines.push(`- Problem Card ID: ${valueOrDash(link.problem_candidate_id)}`);
    lines.push(`- Status: ${valueOrDash(problemCard?.status)}`);
    lines.push(`- Saved Category: ${valueOrDash(link.saved_problem?.category)}`);
    lines.push(`- Saved Status: ${valueOrDash(link.saved_problem?.status)}`, "");
    lines.push("#### Summary", "", quoteBlock(problemCard?.summary), "");
    lines.push("#### Target User", "", quoteBlock(problemCard?.target_user), "");
    lines.push("#### Situation", "", quoteBlock(problemCard?.situation), "");
    pushProblemMetrics(lines, problemCard, 4);
    lines.push("#### Saved Memo", "", quoteBlock(link.saved_problem?.memo), "");
    pushAlternatives(lines, alternativesByProblem.get(link.problem_candidate_id) ?? [], 4);
  }

  const linkedIdeas = stableSort(payload.linked_ideas, [
    (item) => item.created_at,
    (item) => item.idea_candidate_id,
  ]);
  lines.push("## Linked Ideas", "");
  if (!linkedIdeas.length) lines.push("_연결된 Idea Candidate 없음_", "");
  for (const link of linkedIdeas) {
    lines.push(`### ${valueOrDash(link.idea?.title)}`, "");
    lines.push(`- Idea ID: ${valueOrDash(link.idea_candidate_id)}`);
    lines.push(`- Status: ${valueOrDash(link.idea?.status)}`);
    lines.push(`- Implementation Difficulty: ${valueOrDash(link.idea?.implementation_difficulty)}`);
    lines.push(`- Source Problem Card ID: ${valueOrDash(link.idea?.problem_candidate_id)}`);
    lines.push(`- Source Problem: ${valueOrDash(link.problem_card?.title)}`, "");
    lines.push("#### One-liner", "", quoteBlock(link.idea?.one_liner), "");
  }

  return finalize(lines);
}
