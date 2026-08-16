"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function ProjectDetail({ projectId }) {
  const [detail, setDetail] = useState(null);
  const [options, setOptions] = useState({ active_saved_problems: [], ideas: [] });
  const [form, setForm] = useState({ title: "", purpose: "" });
  const [selectedProblem, setSelectedProblem] = useState("");
  const [selectedIdea, setSelectedIdea] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const applyDetail = useCallback((payload) => {
    if (!payload?.project) return;
    setDetail(payload);
    setForm({
      title: payload.project.title ?? "",
      purpose: payload.project.purpose ?? "",
    });
  }, []);

  const loadOptions = useCallback(async () => {
    const response = await fetch(`/api/research-projects/${projectId}/link-options`, { cache: "no-store" });
    const payload = await readJson(response);
    if (!response.ok) throw new Error(apiMessage(payload, "연결 가능한 자산을 불러오지 못했습니다."));
    setOptions(payload ?? { active_saved_problems: [], ideas: [] });
  }, [projectId]);

  const loadDetail = useCallback(async () => {
    setError("");
    try {
      const [detailResponse] = await Promise.all([
        fetch(`/api/research-projects/${projectId}`, { cache: "no-store" }),
        loadOptions(),
      ]);
      const payload = await readJson(detailResponse);
      if (!detailResponse.ok) throw new Error(apiMessage(payload, "Research Project를 불러오지 못했습니다."));
      applyDetail(payload);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [applyDetail, loadOptions, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDetail(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail]);

  async function runMutation(operation, successMessage) {
    if (isWorking) return null;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const payload = await operation();
      if (payload?.project) applyDetail(payload);
      await loadOptions();
      setMessage(successMessage);
      return payload;
    } catch (mutationError) {
      setError(errorMessage(mutationError));
      return null;
    } finally {
      setIsWorking(false);
    }
  }

  async function saveMetadata(event) {
    event.preventDefault();
    await runMutation(async () => {
      const response = await fetch(`/api/research-projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, purpose: form.purpose || null }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Research Project 수정에 실패했습니다."));
      return payload;
    }, "Research Project 정보를 저장했습니다.");
  }

  async function changeStatus(status) {
    await runMutation(async () => {
      const response = await fetch(`/api/research-projects/${projectId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Research Project 상태 변경에 실패했습니다."));
      return payload;
    }, status === "archived" ? "Research Project를 보관했습니다." : "Research Project를 복구했습니다.");
  }

  async function linkProblem() {
    if (!selectedProblem) return;
    const payload = await runMutation(async () => {
      const response = await fetch(`/api/research-projects/${projectId}/problems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_candidate_id: selectedProblem }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Saved Problem 연결에 실패했습니다."));
      return result;
    }, "Saved Problem을 Research Project에 연결했습니다.");
    if (payload) setSelectedProblem("");
  }

  async function unlinkProblem(problemCandidateId) {
    await runMutation(async () => {
      const response = await fetch(
        `/api/research-projects/${projectId}/problems/${problemCandidateId}`,
        { method: "DELETE" },
      );
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Saved Problem 연결 해제에 실패했습니다."));
      return payload;
    }, "Saved Problem 연결을 해제했습니다.");
  }

  async function linkIdea() {
    if (!selectedIdea) return;
    const payload = await runMutation(async () => {
      const response = await fetch(`/api/research-projects/${projectId}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_candidate_id: selectedIdea }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Idea Candidate 연결에 실패했습니다."));
      return result;
    }, "Idea Candidate를 Research Project에 연결했습니다.");
    if (payload) setSelectedIdea("");
  }

  async function unlinkIdea(ideaId) {
    await runMutation(async () => {
      const response = await fetch(`/api/research-projects/${projectId}/ideas/${ideaId}`, {
        method: "DELETE",
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(payload, "Idea Candidate 연결 해제에 실패했습니다."));
      return payload;
    }, "Idea Candidate 연결을 해제했습니다.");
  }

  const linkedProblemIds = useMemo(
    () => new Set((detail?.linked_problems ?? []).map((item) => item.problem_candidate_id)),
    [detail],
  );
  const linkedIdeaIds = useMemo(
    () => new Set((detail?.linked_ideas ?? []).map((item) => item.idea_candidate_id)),
    [detail],
  );
  const availableProblems = (options.active_saved_problems ?? []).filter(
    (item) => !linkedProblemIds.has(item.problem_candidate_id),
  );
  const availableIdeas = (options.ideas ?? []).filter((item) => !linkedIdeaIds.has(item.id));

  if (isLoading) return <section className="card">Research Project를 불러오는 중입니다.</section>;
  if (!detail?.project) {
    return (
      <section className="card stack">
        <p className="notice error">{error || "Research Project를 찾을 수 없습니다."}</p>
        <Link className="button-link" href="/projects">Project 목록</Link>
      </section>
    );
  }

  const project = detail.project;
  const readOnly = project.status === "archived";

  return (
    <>
      <section className="card stack">
        <div className="section-heading detail-heading">
          <div>
            <p className="eyebrow">Research Project</p>
            <h1>{project.title}</h1>
            <p className="record-id">{project.id}</p>
          </div>
          <span className="status-badge">{project.status}</span>
        </div>
        <p>{project.purpose || "조사 목적이 아직 입력되지 않았습니다."}</p>
        <div className="inline-actions">
          <Link className="button-link" href="/projects">전체 Projects</Link>
          <button className="button-secondary" disabled={isWorking} onClick={loadDetail} type="button">
            서버 재조회
          </button>
          {readOnly ? (
            <button disabled={isWorking} onClick={() => changeStatus("active")} type="button">Project 복구</button>
          ) : (
            <button className="button-secondary" disabled={isWorking} onClick={() => changeStatus("archived")} type="button">
              Project 보관
            </button>
          )}
        </div>
        {readOnly ? (
          <p className="notice warning">보관된 Project는 조회만 가능합니다. 연결이나 메타데이터를 바꾸려면 먼저 복구하십시오.</p>
        ) : null}
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        {message ? <p className="notice success" role="status">{message}</p> : null}
      </section>

      {!readOnly ? (
        <form className="card stack" onSubmit={saveMetadata}>
          <div>
            <p className="eyebrow">Metadata</p>
            <h2>프로젝트 정보</h2>
          </div>
          <label className="field stack-sm">
            <span>프로젝트 이름</span>
            <input
              maxLength={200}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
              value={form.title}
            />
          </label>
          <label className="field stack-sm">
            <span>조사 목적</span>
            <textarea
              maxLength={4000}
              onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))}
              rows={5}
              value={form.purpose}
            />
          </label>
          <button disabled={isWorking || !form.title.trim()} type="submit">Project 정보 저장</button>
        </form>
      ) : null}

      <section className="card stack" aria-labelledby="project-problems-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Saved Problems</p>
            <h2 id="project-problems-title">연결된 Saved Problem {detail.linked_problems.length}개</h2>
          </div>
        </div>

        {!readOnly ? (
          <div className="inline-actions research-project-link-row">
            <select disabled={isWorking || !availableProblems.length} onChange={(event) => setSelectedProblem(event.target.value)} value={selectedProblem}>
              <option value="">연결할 Saved Problem 선택</option>
              {availableProblems.map((item) => (
                <option key={item.problem_candidate_id} value={item.problem_candidate_id}>
                  {item.problem_card?.title || item.problem_candidate_id}
                </option>
              ))}
            </select>
            <button disabled={isWorking || !selectedProblem} onClick={linkProblem} type="button">Problem 연결</button>
          </div>
        ) : null}

        {detail.linked_problems.length ? (
          <div className="research-project-asset-list">
            {detail.linked_problems.map((item) => (
              <article className="research-project-asset stack-sm" key={item.problem_candidate_id}>
                <div className="section-heading">
                  <div>
                    <strong>{item.problem_card?.title || "Problem Card unavailable"}</strong>
                    <p>{item.problem_card?.summary || "요약 없음"}</p>
                  </div>
                  <span className="status-badge">saved: {item.saved_problem?.status || "unavailable"}</span>
                </div>
                <p className="muted">카테고리 {item.saved_problem?.category || "미분류"} · Evidence {item.problem_card?.evidence_count ?? "-"}</p>
                <div className="inline-actions">
                  <Link className="button-link button-compact" href={`/problem-candidates/${item.problem_candidate_id}`}>Problem Card 열기</Link>
                  {!readOnly ? (
                    <button className="button-secondary button-compact" disabled={isWorking} onClick={() => unlinkProblem(item.problem_candidate_id)} type="button">
                      연결 해제
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="muted">아직 연결된 Saved Problem이 없습니다.</p>}
      </section>

      <section className="card stack" aria-labelledby="project-ideas-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Idea Candidates</p>
            <h2 id="project-ideas-title">연결된 Idea Candidate {detail.linked_ideas.length}개</h2>
          </div>
        </div>

        {!readOnly ? (
          <div className="inline-actions research-project-link-row">
            <select disabled={isWorking || !availableIdeas.length} onChange={(event) => setSelectedIdea(event.target.value)} value={selectedIdea}>
              <option value="">연결할 Idea Candidate 선택</option>
              {availableIdeas.map((idea) => (
                <option key={idea.id} value={idea.id}>{idea.title}</option>
              ))}
            </select>
            <button disabled={isWorking || !selectedIdea} onClick={linkIdea} type="button">Idea 연결</button>
          </div>
        ) : null}

        {detail.linked_ideas.length ? (
          <div className="research-project-asset-list">
            {detail.linked_ideas.map((item) => (
              <article className="research-project-asset stack-sm" key={item.idea_candidate_id}>
                <div className="section-heading">
                  <div>
                    <strong>{item.idea?.title || "Idea Candidate unavailable"}</strong>
                    <p>{item.idea?.one_liner || "설명 없음"}</p>
                  </div>
                  <div className="detail-statuses">
                    <span className="status-badge">{item.idea?.status || "unknown"}</span>
                    <span className="status-badge">{item.idea?.implementation_difficulty || "unknown"}</span>
                  </div>
                </div>
                <p className="muted">Source Problem: {item.problem_card?.title || "source unavailable"}</p>
                <div className="inline-actions">
                  <Link className="button-link button-compact" href={`/idea-candidates/${item.idea_candidate_id}`}>Idea 열기</Link>
                  {!readOnly ? (
                    <button className="button-secondary button-compact" disabled={isWorking} onClick={() => unlinkIdea(item.idea_candidate_id)} type="button">
                      연결 해제
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="muted">아직 연결된 Idea Candidate가 없습니다.</p>}
      </section>
    </>
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiMessage(payload, fallback) {
  return payload?.error?.message || fallback;
}

function errorMessage(error) {
  return error instanceof Error && error.message ? error.message : "Research Project 작업에 실패했습니다.";
}
