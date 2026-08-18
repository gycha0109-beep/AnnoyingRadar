"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "요청을 처리하지 못했습니다.");
  }
  return payload;
}

function uniqueSourceCount(evidence) {
  return new Set((evidence ?? []).map((item) => item.source_key).filter(Boolean)).size;
}

function sourceLabel(item) {
  return item.source_label || item.source_type || "공개 출처";
}

export default function CuratorProblemEditor({ initialDetail }) {
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const { problem, evidence = [], source_problems: sourceProblems = [] } = detail;
  const locked = problem.status === "published";
  const distinctSources = uniqueSourceCount(evidence);
  const readiness = useMemo(() => [
    { label: "제목이 작성됨", ok: Boolean(problem.title?.trim()) },
    { label: "요약이 작성됨", ok: Boolean(problem.summary?.trim()) },
    { label: "공개 Evidence 2건 이상", ok: evidence.length >= 2 },
    { label: "서로 다른 source_key 2개 이상", ok: distinctSources >= 2 },
    {
      label: "Evidence basis가 공개 허용값만 사용",
      ok: evidence.every((item) => ["external_public", "user_opt_in"].includes(item.publication_basis)),
    },
  ], [problem.title, problem.summary, evidence, distinctSources]);
  const publishReady = readiness.every((item) => item.ok);

  async function mutate(key, request, successMessage) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const payload = await readResponse(await request());
      setDetail(payload);
      setNotice(successMessage);
      return payload;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function saveMetadata(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      title: String(form.get("title") ?? "").trim(),
      summary: String(form.get("summary") ?? "").trim(),
      target_user: String(form.get("target_user") ?? "").trim() || null,
      situation: String(form.get("situation") ?? "").trim() || null,
      category: String(form.get("category") ?? "").trim() || null,
    };
    await mutate("metadata", () => fetch(`/api/radar/admin/problems/${problem.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }), "Problem 메타데이터를 저장했습니다.");
  }

  async function addEvidence(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const sourceUrl = String(form.get("source_url") ?? "").trim();
    const explicitSourceKey = String(form.get("source_key") ?? "").trim();
    const sourceKey = explicitSourceKey || sourceUrl;
    if (!sourceKey) {
      setError("source_key 또는 source URL 중 하나는 필요합니다.");
      return;
    }

    const orderRaw = String(form.get("order_index") ?? "").trim();
    const body = {
      excerpt: String(form.get("excerpt") ?? "").trim(),
      publication_basis: String(form.get("publication_basis") ?? "external_public"),
      source_type: String(form.get("source_type") ?? "").trim() || null,
      source_label: String(form.get("source_label") ?? "").trim() || null,
      source_url: sourceUrl || null,
      source_key: sourceKey,
      source_observed_at: String(form.get("source_observed_at") ?? "").trim() || null,
      order_index: orderRaw ? Number.parseInt(orderRaw, 10) : null,
    };

    const payload = await mutate("evidence-add", () => fetch(`/api/radar/admin/problems/${problem.id}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }), "Public Evidence를 추가했습니다.");
    if (payload) formElement.reset();
  }

  async function removeEvidence(evidenceId) {
    await mutate(`evidence-${evidenceId}`, () => fetch(
      `/api/radar/admin/problems/${problem.id}/evidence/${evidenceId}`,
      { method: "DELETE" },
    ), "Public Evidence를 제거했습니다.");
  }

  async function linkSourceProblem(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const problemCandidateId = String(form.get("problem_candidate_id") ?? "").trim();
    const payload = await mutate("lineage-add", () => fetch(`/api/radar/admin/problems/${problem.id}/source-problems`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ problem_candidate_id: problemCandidateId }),
    }), "Private Problem Card lineage를 연결했습니다.");
    if (payload) formElement.reset();
  }

  async function unlinkSourceProblem(problemCandidateId) {
    await mutate(`lineage-${problemCandidateId}`, () => fetch(
      `/api/radar/admin/problems/${problem.id}/source-problems/${problemCandidateId}`,
      { method: "DELETE" },
    ), "Private Problem Card lineage를 해제했습니다.");
  }

  async function changeStatus(status) {
    await mutate(`status-${status}`, () => fetch(`/api/radar/admin/problems/${problem.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }), status === "published" ? "Public Radar에 Publish했습니다." : "Public Problem을 Archive했습니다.");
  }

  return (
    <div className="curator-editor">
      <header className="curator-editor-header">
        <div>
          <Link className="curator-back" href="/curator">← Publication Queue</Link>
          <div className="curator-problem-meta">
            <span className={`curator-status curator-status-${problem.status}`}>{problem.status}</span>
            {problem.category ? <span>{problem.category}</span> : null}
          </div>
          <h1>{problem.title}</h1>
          <p>{problem.summary}</p>
        </div>
        <div className="curator-status-actions">
          {problem.status !== "published" ? (
            <button
              className="curator-primary-action"
              disabled={!publishReady || Boolean(busy)}
              onClick={() => changeStatus("published")}
              type="button"
            >
              {busy === "status-published" ? "Publish 중…" : "Publish"}
            </button>
          ) : null}
          {problem.status !== "archived" ? (
            <button
              className="curator-secondary-action"
              disabled={Boolean(busy)}
              onClick={() => changeStatus("archived")}
              type="button"
            >
              {busy === "status-archived" ? "Archive 중…" : "Archive"}
            </button>
          ) : null}
          {problem.status === "published" ? (
            <Link className="curator-public-link" href={`/radar/problems/${problem.id}`}>공개 화면 보기 ↗</Link>
          ) : null}
        </div>
      </header>

      {locked ? (
        <div className="curator-lock-notice">
          <strong>Published 상태는 편집 잠금입니다.</strong>
          <p>메타데이터, Evidence, lineage를 바꾸려면 먼저 Archive한 뒤 수정하고 다시 Publish하십시오.</p>
        </div>
      ) : null}
      {notice ? <p className="curator-success" role="status">{notice}</p> : null}
      {error ? <p className="curator-error" role="alert">{error}</p> : null}

      <section className="curator-editor-grid">
        <div className="curator-editor-main">
          <section className="curator-panel">
            <div className="curator-section-heading">
              <div><p className="curator-kicker">Problem</p><h2>공개 메타데이터</h2></div>
            </div>
            <form className="curator-metadata-form" onSubmit={saveMetadata}>
              <label><span>제목</span><input defaultValue={problem.title} disabled={locked} maxLength={240} name="title" required /></label>
              <label><span>요약</span><textarea defaultValue={problem.summary} disabled={locked} maxLength={4000} name="summary" required rows={5} /></label>
              <div className="curator-form-grid">
                <label><span>주로 겪는 사람</span><input defaultValue={problem.target_user ?? ""} disabled={locked} maxLength={1000} name="target_user" /></label>
                <label><span>카테고리</span><input defaultValue={problem.category ?? ""} disabled={locked} maxLength={120} name="category" /></label>
              </div>
              <label><span>발생 상황</span><textarea defaultValue={problem.situation ?? ""} disabled={locked} maxLength={2000} name="situation" rows={3} /></label>
              <button disabled={locked || Boolean(busy)} type="submit">{busy === "metadata" ? "저장 중…" : "메타데이터 저장"}</button>
            </form>
          </section>

          <section className="curator-panel">
            <div className="curator-section-heading">
              <div><p className="curator-kicker">Evidence</p><h2>공개 근거 {evidence.length}건</h2></div>
            </div>
            <div className="curator-evidence-list">
              {evidence.map((item) => (
                <article className="curator-evidence-card" key={item.id}>
                  <blockquote>“{item.excerpt}”</blockquote>
                  <div className="curator-evidence-meta">
                    <span>{item.publication_basis}</span>
                    <span>{sourceLabel(item)}</span>
                    <code>{item.source_key}</code>
                  </div>
                  <div className="curator-inline-actions">
                    {item.source_url ? <a href={item.source_url} rel="noreferrer" target="_blank">원문 ↗</a> : null}
                    <button
                      className="curator-danger-action"
                      disabled={locked || Boolean(busy)}
                      onClick={() => removeEvidence(item.id)}
                      type="button"
                    >제거</button>
                  </div>
                </article>
              ))}
              {evidence.length === 0 ? <p className="curator-muted">아직 Public Evidence가 없습니다.</p> : null}
            </div>

            <form className="curator-evidence-form" onSubmit={addEvidence}>
              <h3>Evidence 추가</h3>
              <label><span>공개 excerpt</span><textarea disabled={locked} maxLength={600} name="excerpt" required rows={4} /></label>
              <div className="curator-form-grid">
                <label><span>Publication basis</span><select defaultValue="external_public" disabled={locked} name="publication_basis"><option value="external_public">external_public</option><option value="user_opt_in">user_opt_in</option></select></label>
                <label><span>Source type</span><input disabled={locked} maxLength={120} name="source_type" placeholder="threads, review, community…" /></label>
              </div>
              <label><span>Source label</span><input disabled={locked} maxLength={240} name="source_label" placeholder="사용자에게 보일 출처 이름" /></label>
              <label><span>Source URL</span><input disabled={locked} maxLength={2000} name="source_url" placeholder="https://…" type="url" /></label>
              <label><span>Source key</span><input disabled={locked} maxLength={500} name="source_key" placeholder="비우면 Source URL을 사용합니다" /><small>동일 원문 중복 판별용 내부 키입니다. Publish gate는 서로 다른 source_key 2개 이상을 요구합니다.</small></label>
              <div className="curator-form-grid">
                <label><span>관측 시각</span><input disabled={locked} name="source_observed_at" type="datetime-local" /></label>
                <label><span>표시 순서</span><input disabled={locked} min="0" name="order_index" type="number" /></label>
              </div>
              <button disabled={locked || Boolean(busy)} type="submit">{busy === "evidence-add" ? "추가 중…" : "Evidence 추가"}</button>
            </form>
          </section>

          <section className="curator-panel">
            <div className="curator-section-heading">
              <div><p className="curator-kicker">Lineage</p><h2>근거가 된 Private Problem Cards</h2></div>
            </div>
            <div className="curator-lineage-list">
              {sourceProblems.map((link) => (
                <article key={link.id}>
                  <div>
                    <strong>{link.problem?.title ?? link.problem_candidate_id}</strong>
                    {link.problem?.summary ? <p>{link.problem.summary}</p> : null}
                    <code>{link.problem_candidate_id}</code>
                  </div>
                  <button
                    className="curator-danger-action"
                    disabled={locked || Boolean(busy)}
                    onClick={() => unlinkSourceProblem(link.problem_candidate_id)}
                    type="button"
                  >연결 해제</button>
                </article>
              ))}
              {sourceProblems.length === 0 ? <p className="curator-muted">연결된 Private Problem Card가 없습니다. Lineage는 Publish 필수 조건은 아닙니다.</p> : null}
            </div>
            <form className="curator-lineage-form" onSubmit={linkSourceProblem}>
              <label><span>Confirmed Problem Candidate ID</span><input disabled={locked} name="problem_candidate_id" required placeholder="UUID" /></label>
              <button disabled={locked || Boolean(busy)} type="submit">{busy === "lineage-add" ? "연결 중…" : "Lineage 연결"}</button>
            </form>
          </section>
        </div>

        <aside className="curator-readiness-panel">
          <p className="curator-kicker">Publication Gate</p>
          <h2>{publishReady ? "Publish 가능" : "아직 Publish 불가"}</h2>
          <ul>
            {readiness.map((item) => <li className={item.ok ? "is-ready" : "is-blocked"} key={item.label}><span>{item.ok ? "✓" : "×"}</span>{item.label}</li>)}
          </ul>
          <div className="curator-readiness-stats">
            <div><strong>{evidence.length}</strong><span>Evidence</span></div>
            <div><strong>{distinctSources}</strong><span>Distinct sources</span></div>
            <div><strong>{sourceProblems.length}</strong><span>Lineage links</span></div>
          </div>
          <p className="curator-muted">최종 Publish 시에도 DB publication gate가 동일 조건을 다시 검증합니다.</p>
        </aside>
      </section>
    </div>
  );
}
