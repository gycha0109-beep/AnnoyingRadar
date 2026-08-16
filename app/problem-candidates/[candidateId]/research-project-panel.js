"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function ResearchProjectPanel({ candidateId }) {
  const [payload, setPayload] = useState(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/problem-candidates/${candidateId}/projects`, { cache: "no-store" });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Research Project 정보를 불러오지 못했습니다."));
      setPayload(result);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connectExisting() {
    if (!selectedProject) return;
    await mutate(async () => {
      const response = await fetch(`/api/research-projects/${selectedProject}/problems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_candidate_id: candidateId }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Research Project 연결에 실패했습니다."));
      setSelectedProject("");
    }, "Saved Problem을 Research Project에 연결했습니다.");
  }

  async function createAndConnect() {
    if (!newProjectTitle.trim()) return;
    await mutate(async () => {
      const response = await fetch("/api/research-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newProjectTitle,
          purpose: null,
          initial_problem_candidate_id: candidateId,
        }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Research Project 생성·연결에 실패했습니다."));
      setNewProjectTitle("");
    }, "새 Research Project를 만들고 Saved Problem을 연결했습니다.");
  }

  async function unlink(projectId) {
    await mutate(async () => {
      const response = await fetch(`/api/research-projects/${projectId}/problems/${candidateId}`, {
        method: "DELETE",
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Research Project 연결 해제에 실패했습니다."));
    }, "Research Project 연결을 해제했습니다.");
  }

  async function mutate(operation, successMessage) {
    if (isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      await operation();
      await load();
      setMessage(successMessage);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoading) return <section className="card">Research Project 연결 정보를 불러오는 중입니다.</section>;
  if (!payload?.saved_problem) return null;

  const memberships = payload.memberships ?? [];
  const linkedIds = new Set(memberships.map((item) => item.project_id));
  const availableProjects = (payload.active_projects ?? []).filter((project) => !linkedIds.has(project.id));
  const canLink = payload.saved_problem.status === "active";

  return (
    <section className="card stack" id="research-projects" aria-labelledby="research-project-panel-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Research Projects</p>
          <h2 id="research-project-panel-title">Project 연결</h2>
        </div>
        <Link className="button-link button-compact" href="/projects">전체 Projects</Link>
      </div>
      <p className="muted">
        Project 연결은 Saved Problem 관리 상태와 별개입니다. Project를 보관하거나 연결을 해제해도 Problem Card와 Idea lifecycle은 바뀌지 않습니다.
      </p>

      <div className="research-project-memberships stack-sm">
        {memberships.length ? memberships.map((item) => (
          <div className="section-heading research-project-membership" key={item.project_id}>
            <Link href={`/projects/${item.project_id}`}>{item.project?.title || "Research Project"}</Link>
            <div className="inline-actions">
              <span className="status-badge">{item.project?.status || "unknown"}</span>
              {item.project?.status === "active" ? (
                <button className="button-secondary button-compact" disabled={isWorking} onClick={() => unlink(item.project_id)} type="button">
                  연결 해제
                </button>
              ) : null}
            </div>
          </div>
        )) : <p className="muted">아직 연결된 Research Project가 없습니다.</p>}
      </div>

      {canLink ? (
        <>
          <div className="inline-actions research-project-link-row">
            <select disabled={isWorking || !availableProjects.length} onChange={(event) => setSelectedProject(event.target.value)} value={selectedProject}>
              <option value="">기존 Project 선택</option>
              {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
            <button disabled={isWorking || !selectedProject} onClick={connectExisting} type="button">Project 연결</button>
          </div>
          <div className="inline-actions research-project-link-row">
            <input
              maxLength={200}
              onChange={(event) => setNewProjectTitle(event.target.value)}
              placeholder="새 Project 이름"
              value={newProjectTitle}
            />
            <button className="button-secondary" disabled={isWorking || !newProjectTitle.trim()} onClick={createAndConnect} type="button">
              새 Project 생성·연결
            </button>
          </div>
        </>
      ) : (
        <p className="notice warning">Saved Problem을 복구하면 새 Research Project 연결을 추가할 수 있습니다.</p>
      )}

      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice success" role="status">{message}</p> : null}
    </section>
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
