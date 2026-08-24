"use client";

import { useState } from "react";
import Link from "next/link";

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "요청을 처리하지 못했습니다.");
  }
  return payload;
}

function sourceLabel(item) {
  return item.source_label || item.source_type || "공개 출처";
}

function incidentLabel(incident) {
  return incident?.label || incident?.incident_key || "Incident 미연결";
}

export default function CuratorProblemEditor({ initialDetail }) {
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);

  const {
    problem,
    evidence = [],
    incidents = [],
    publication_readiness: publicationReadiness,
    source_problems: sourceProblems = [],
  } = detail;
  const locked = problem.status === "published";
  const readiness = publicationReadiness?.checks ?? [];
  const readinessStats = publicationReadiness?.stats ?? {};
  const publishReady = Boolean(publicationReadiness?.structurally_publishable);

  async function mutate(key, request, successMessage) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const payload = await readResponse(await request());
      setDetail(payload);
      setPublicationConfirmed(false);
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
    }), "Public Evidence를 추가했습니다. Incident identity가 없으므로 Publish 전 lineage 보강이 필요합니다.");
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
    const body = { status };
    if (status === "published") body.publication_confirmed = publicationConfirmed;
    await mutate(`status-${status}`, () => fetch(`/api/radar/admin/problems/${problem.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
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
              disabled={!publishReady || !publicationConfirmed || Boolean(busy)}
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
              <div><p className="curator-kicker">Incident Lineage</p><h2>독립 사건 {incidents.length}건</h2></div>
            </div>
            <div className="curator-lineage-list">
              {incidents.map((incident) => {
                const incidentEvidence = evidence.filter((item) => item.incident_id === incident.id);
                return (
                  <article key={incident.id}>
                    <div>
                      <strong>{incidentLabel(incident)}</strong>
                      <p>{incident.source_count}개 Source · {incident.evidence_count}개 Evidence</p>
                      <code>{incident.incident_key}</code>
                      <ul>
                        {incidentEvidence.map((item) => (
                          <li key={item.id}>
                            {sourceLabel(item)} · {item.source_signal?.author_handle || item.source_signal?.source_platform || "Source"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                );
              })}
              {incidents.length === 0 ? <p className="curator-muted">Incident identity가 연결되지 않았습니다.</p> : null}
            </div>
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
                    <span>{incidentLabel(item.incident)}</span>
                    <span>{item.incident_lineage_valid ? "lineage verified" : "lineage missing"}</span>
                    <code>{item.source_key}</code>
                  </div>
                  {item.source_signal ? (
                    <p className="curator-muted">
                      Source Signal · {item.source_signal.source_platform}
                      {item.source_signal.author_handle ? ` · ${item.source_signal.author_handle}` : ""}
                    </p>
                  ) : null}
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
              <h3>수동 Evidence 추가</h3>
              <p className="curator-muted">이 호환 입력 경로는 Incident identity를 지정하지 않습니다. 여기서 추가한 Evidence는 draft에는 저장할 수 있지만 Incident lineage를 보강하기 전에는 Publish gate를 통과할 수 없습니다.</p>
              <label><span>공개 excerpt</span><textarea disabled={locked} maxLength={600} name="excerpt" required rows={4} /></label>
              <div className="curator-form-grid">
                <label><span>Publication basis</span><select defaultValue="external_public" disabled={locked} name="publication_basis"><option value="external_public">external_public</option><option value="user_opt_in">user_opt_in</option></select></label>
                <label><span>Source type</span><input disabled={locked} maxLength={120} name="source_type" placeholder="threads, review, community…" /></label>
              </div>
              <label><span>Source label</span><input disabled={locked} maxLength={240} name="source_label" placeholder="사용자에게 보일 출처 이름" /></label>
              <label><span>Source URL</span><input disabled={locked} maxLength={2000} name="source_url" placeholder="https://…" type="url" /></label>
              <label><span>Source key</span><input disabled={locked} maxLength={500} name="source_key" placeholder="비우면 Source URL을 사용합니다" /><small>동일 원문 중복 판별용 내부 키입니다. source_key 수는 Incident 수를 대체하지 않습니다.</small></label>
              <div className="curator-form-grid">
                <label><span>관측 시각</span><input disabled={locked} name="source_observed_at" type="datetime-local" /></label>
                <label><span>표시 순서</span><input disabled={locked} min="0" name="order_index" type="number" /></label>
              </div>
              <button disabled={locked || Boolean(busy)} type="submit">{busy === "evidence-add" ? "추가 중…" : "Evidence 추가"}</button>
            </form>
          </section>

          <section className="curator-panel">
            <div className="curator-section-heading">
              <div><p className="curator-kicker">Legacy Lineage</p><h2>근거가 된 Private Problem Cards</h2></div>
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
              {sourceProblems.length === 0 ? <p className="curator-muted">연결된 Private Problem Card가 없습니다. 이 lineage는 Publish 반복성 근거가 아닙니다.</p> : null}
            </div>
            <form className="curator-lineage-form" onSubmit={linkSourceProblem}>
              <label><span>Confirmed Problem Candidate ID</span><input disabled={locked} name="problem_candidate_id" required placeholder="UUID" /></label>
              <button disabled={locked || Boolean(busy)} type="submit">{busy === "lineage-add" ? "연결 중…" : "Lineage 연결"}</button>
            </form>
          </section>
        </div>

        <aside className="curator-readiness-panel">
          <p className="curator-kicker">Publication Gate</p>
          <h2>{publishReady ? "구조적 Gate 통과" : "아직 Publish 불가"}</h2>
          <p className="curator-muted">구조적 Gate 통과는 편집 승인이나 자동 게시를 의미하지 않습니다.</p>
          <ul>
            {readiness.map((item) => <li className={item.ok ? "is-ready" : "is-blocked"} key={item.code ?? item.label}><span>{item.ok ? "✓" : "×"}</span>{item.label}</li>)}
          </ul>
          <div className="curator-readiness-stats">
            <div><strong>{readinessStats.evidence_count ?? evidence.length}</strong><span>Evidence</span></div>
            <div><strong>{readinessStats.distinct_source_count ?? 0}</strong><span>Distinct sources</span></div>
            <div><strong>{readinessStats.distinct_incident_count ?? 0}</strong><span>Distinct incidents</span></div>
          </div>
          {problem.status !== "published" ? (
            <label className="curator-publication-confirmation">
              <input
                checked={publicationConfirmed}
                disabled={!publishReady || Boolean(busy)}
                onChange={(event) => setPublicationConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>Incident lineage와 공개 Evidence를 직접 검토했으며 이 Problem을 공개할 의사가 있습니다.</span>
            </label>
          ) : null}
          <p className="curator-muted">Publish 요청 시 서버와 DB publication gate가 다시 검증합니다. 체크만으로는 게시되지 않습니다.</p>
        </aside>
      </section>
    </div>
  );
}
