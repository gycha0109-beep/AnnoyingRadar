"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function ResearchProjectPanel({ ideaId }) {
  const [payload, setPayload] = useState(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/idea-candidates/${ideaId}/projects`, { cache: "no-store" });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Research Project 정보를 불러오지 못했습니다."));
      setPayload(result);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [ideaId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connect() {
    if (!selectedProject || isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/research-projects/${selectedProject}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_candidate_id: ideaId }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Research Project 연결에 실패했습니다."));
      setSelectedProject("");
      setMessage("Idea Candidate를 Research Project에 연결했습니다.");
      await load();
    } catch (connectError) {
      setError(errorMessage(connectError));
    } finally {
      setIsWorking(false);
    }
  }

  async function unlink(projectId) {
    if (isWorking) return;
    setIsWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/research-projects/${projectId}/ideas/${ideaId}`, {
        method: "DELETE",
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(apiMessage(result, "Research Project 연결 해제에 실패했습니다."));
      setMessage("Idea Candidate의 Research Project 연결을 해제했습니다.");
      await load();
    } catch (unlinkError) {
      setError(errorMessage(unlinkError));
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoading) return <section className="card">Research Project 연결 정보를 불러오는 중입니다.</section>;

  const memberships = payload?.memberships ?? [];
  const linkedIds = new Set(memberships.map((item) => item.project_id));
  const availableProjects = (payload?.active_projects ?? []).filter((project) => !linkedIds.has(project.id));

  return (
    <section className="card stack" aria-labelledby="idea-project-panel-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Research Projects</p>
          <h2 id="idea-project-panel-title">Project 연결</h2>
        </div>
        <Link className="button-link button-compact" href="/projects">전체 Projects</Link>
      </div>
      <p className="muted">
        Idea의 source Problem Card가 어떤 Project에 속해 있더라도 자동 상속하지 않습니다. 이 Idea를 검토할 Project만 명시적으로 연결합니다.
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

      <div className="inline-actions research-project-link-row">
        <select disabled={isWorking || !availableProjects.length} onChange={(event) => setSelectedProject(event.target.value)} value={selectedProject}>
          <option value="">기존 Project 선택</option>
          {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
        <button disabled={isWorking || !selectedProject} onClick={connect} type="button">Project 연결</button>
      </div>

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
