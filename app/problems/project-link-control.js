"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function ProjectLinkControl({ problemCandidateId, savedStatus }) {
  const [payload, setPayload] = useState({ memberships: [], active_projects: [] });
  const [selectedProject, setSelectedProject] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/problem-candidates/${problemCandidateId}/projects`, { cache: "no-store" });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Project 연결 정보를 불러오지 못했습니다."));
      setPayload(result ?? { memberships: [], active_projects: [] });
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [problemCandidateId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connectExisting() {
    if (!selectedProject || isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/research-projects/${selectedProject}/problems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_candidate_id: problemCandidateId }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Project 연결에 실패했습니다."));
      setSelectedProject("");
      setMessage("Saved Problem을 기존 Research Project에 연결했습니다.");
      await load();
    } catch (connectError) {
      setError(errorMessage(connectError));
    } finally {
      setIsWorking(false);
    }
  }

  async function createAndConnect() {
    if (!newProjectTitle.trim() || isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/research-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newProjectTitle,
          purpose: null,
          initial_problem_candidate_id: problemCandidateId,
        }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Research Project 생성·연결에 실패했습니다."));
      setNewProjectTitle("");
      setMessage("새 Research Project를 만들고 Saved Problem을 연결했습니다.");
      await load();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoading) return <p className="muted">Project 연결 정보를 불러오는 중입니다.</p>;

  const linkedIds = new Set((payload.memberships ?? []).map((item) => item.project_id));
  const availableProjects = (payload.active_projects ?? []).filter((project) => !linkedIds.has(project.id));
  const canLink = savedStatus === "active";

  return (
    <div className="research-project-inline stack-sm">
      <div className="inline-actions">
        <strong>Research Projects</strong>
        {(payload.memberships ?? []).map((item) => (
          <Link className="button-link button-compact" href={`/projects/${item.project_id}`} key={item.project_id}>
            {item.project?.title || "Project"}
          </Link>
        ))}
        {!(payload.memberships ?? []).length ? <span className="muted">연결 없음</span> : null}
      </div>

      {canLink ? (
        <>
          <div className="inline-actions research-project-link-row">
            <select disabled={isWorking || !availableProjects.length} onChange={(event) => setSelectedProject(event.target.value)} value={selectedProject}>
              <option value="">기존 Project 선택</option>
              {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
            <button className="button-secondary button-compact" disabled={isWorking || !selectedProject} onClick={connectExisting} type="button">
              연결
            </button>
          </div>
          <div className="inline-actions research-project-link-row">
            <input
              maxLength={200}
              onChange={(event) => setNewProjectTitle(event.target.value)}
              placeholder="새 Project 이름"
              value={newProjectTitle}
            />
            <button className="button-secondary button-compact" disabled={isWorking || !newProjectTitle.trim()} onClick={createAndConnect} type="button">
              새 Project 생성·연결
            </button>
          </div>
        </>
      ) : (
        <p className="muted">보관된 Saved Problem은 기존 Project 연결만 유지됩니다. 새 연결은 Saved Problem 복구 후 가능합니다.</p>
      )}

      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice success" role="status">{message}</p> : null}
    </div>
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
