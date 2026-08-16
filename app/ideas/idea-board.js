"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  IDEA_STATUSES,
  canTransitionIdeaStatus,
} from "../../lib/ideas/contracts.mjs";

const ACTIVE_STATUSES = ["candidate", "researching", "build_soon", "paused"];
const STORAGE_STATUSES = ["discarded", "archived"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const STATUS_LABELS = Object.freeze({
  candidate: "Candidate",
  researching: "Researching",
  build_soon: "Build Soon",
  paused: "Paused",
  discarded: "Discarded",
  archived: "Archived",
});

export default function IdeaBoard({ initialIdeas, projects, selectedProjectId = null }) {
  const router = useRouter();
  const [ideas, setIdeas] = useState(initialIdeas ?? []);
  const [pendingIdeaIds, setPendingIdeaIds] = useState(() => new Set());
  const [draggedIdeaId, setDraggedIdeaId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const ideasByStatus = useMemo(() => {
    const groups = new Map(IDEA_STATUSES.map((status) => [status, []]));
    for (const idea of ideas) groups.get(idea.status)?.push(idea);
    for (const group of groups.values()) {
      group.sort(compareByRecentUpdate);
    }
    return groups;
  }, [ideas]);

  function changeProjectFilter(event) {
    const projectId = event.target.value;
    router.push(projectId ? `/ideas?project=${encodeURIComponent(projectId)}` : "/ideas");
  }

  function canDrop(ideaId, targetStatus) {
    const idea = ideas.find((item) => item.id === ideaId);
    return Boolean(
      idea
      && !pendingIdeaIds.has(idea.id)
      && idea.status !== targetStatus
      && canTransitionIdeaStatus(idea.status, targetStatus)
    );
  }

  async function moveIdea(ideaId, targetStatus) {
    const snapshot = ideas.find((item) => item.id === ideaId);
    if (!snapshot || pendingIdeaIds.has(ideaId)) return;
    if (!canTransitionIdeaStatus(snapshot.status, targetStatus)) {
      setError(`${snapshot.status} → ${targetStatus} 상태 이동은 허용되지 않습니다.`);
      return;
    }

    setError("");
    setMessage("");
    setPendingIdeaIds((current) => new Set([...current, ideaId]));
    setIdeas((current) => current.map((idea) => (
      idea.id === ideaId
        ? { ...idea, status: targetStatus, updated_at: new Date().toISOString() }
        : idea
    )));

    try {
      const response = await fetch(`/api/idea-candidates/${ideaId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const payload = await readJson(response);
      if (!response.ok || !payload?.idea) {
        throw new Error(apiMessage(payload, "Idea Candidate 상태 변경에 실패했습니다."));
      }

      setIdeas((current) => current.map((idea) => (
        idea.id === ideaId ? { ...idea, ...payload.idea } : idea
      )));
      setMessage(`${snapshot.title} → ${STATUS_LABELS[targetStatus]} 이동을 저장했습니다.`);
    } catch (mutationError) {
      setIdeas((current) => current.map((idea) => (
        idea.id === ideaId ? snapshot : idea
      )));
      setError(errorMessage(mutationError));
      await refreshIdea(ideaId);
    } finally {
      setPendingIdeaIds((current) => {
        const next = new Set(current);
        next.delete(ideaId);
        return next;
      });
    }
  }

  async function refreshIdea(ideaId) {
    try {
      const response = await fetch(`/api/idea-candidates/${ideaId}`, { cache: "no-store" });
      const payload = await readJson(response);
      if (!response.ok || !payload?.idea) return;
      setIdeas((current) => current.map((idea) => (
        idea.id === ideaId ? { ...idea, ...payload.idea } : idea
      )));
    } catch {
      // The optimistic rollback already restored the last known board state.
    }
  }

  function handleDragStart(event, ideaId) {
    if (pendingIdeaIds.has(ideaId)) {
      event.preventDefault();
      return;
    }
    setDraggedIdeaId(ideaId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ideaId);
  }

  function handleDragOver(event, status) {
    if (!draggedIdeaId || !canDrop(draggedIdeaId, status)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStatus(status);
  }

  function handleDrop(event, status) {
    event.preventDefault();
    const ideaId = draggedIdeaId || event.dataTransfer.getData("text/plain");
    setDragOverStatus(null);
    setDraggedIdeaId(null);
    if (ideaId && canDrop(ideaId, status)) void moveIdea(ideaId, status);
  }

  function handleDragEnd() {
    setDraggedIdeaId(null);
    setDragOverStatus(null);
  }

  return (
    <div className="stack idea-board-shell">
      <section className="card stack idea-board-toolbar" aria-labelledby="idea-board-filter-title">
        <div className="section-heading">
          <div className="stack-sm">
            <p className="eyebrow">Board Filter</p>
            <h2 id="idea-board-filter-title">Research Project</h2>
          </div>
          <span className="status-badge">Idea {ideas.length}개</span>
        </div>
        <label className="field stack-sm idea-board-filter">
          <span>Project 기준으로 보기</span>
          <select value={selectedProjectId ?? ""} onChange={changeProjectFilter}>
            <option value="">모든 Ideas</option>
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}{project.status === "archived" ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        {selectedProjectId ? (
          <p className="notice warning">
            Project는 필터링 컨텍스트입니다. 여기서 상태를 바꾸면 Idea Candidate의 전역 lifecycle이 변경됩니다.
          </p>
        ) : null}
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        {message ? <p className="notice success" role="status">{message}</p> : null}
      </section>

      <BoardSection
        title="Active Workflow"
        description="검토 중인 Idea Candidate를 의사결정 상태에 따라 이동합니다."
        statuses={ACTIVE_STATUSES}
        ideasByStatus={ideasByStatus}
        pendingIdeaIds={pendingIdeaIds}
        dragOverStatus={dragOverStatus}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onMove={moveIdea}
      />

      <BoardSection
        title="Inactive / Storage"
        description="폐기하거나 보관한 Idea도 기존 lifecycle 규칙에 따라 다시 활성 상태로 이동할 수 있습니다."
        statuses={STORAGE_STATUSES}
        ideasByStatus={ideasByStatus}
        pendingIdeaIds={pendingIdeaIds}
        dragOverStatus={dragOverStatus}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onMove={moveIdea}
        secondary
      />
    </div>
  );
}

function BoardSection({
  title,
  description,
  statuses,
  ideasByStatus,
  pendingIdeaIds,
  dragOverStatus,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMove,
  secondary = false,
}) {
  return (
    <section className={`idea-board-section${secondary ? " idea-board-section-secondary" : ""}`}>
      <div className="stack-sm idea-board-section-heading">
        <p className="eyebrow">{title}</p>
        <p className="muted">{description}</p>
      </div>
      <div className={`idea-board-grid idea-board-grid-${statuses.length}`}>
        {statuses.map((status) => (
          <IdeaLane
            key={status}
            status={status}
            ideas={ideasByStatus.get(status) ?? []}
            pendingIdeaIds={pendingIdeaIds}
            isDragOver={dragOverStatus === status}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onMove={onMove}
          />
        ))}
      </div>
    </section>
  );
}

function IdeaLane({
  status,
  ideas,
  pendingIdeaIds,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMove,
}) {
  return (
    <section
      className={`idea-board-lane${isDragOver ? " is-drag-over" : ""}`}
      data-status={status}
      onDragOver={(event) => onDragOver(event, status)}
      onDrop={(event) => onDrop(event, status)}
      aria-labelledby={`idea-lane-${status}`}
    >
      <header className="idea-board-lane-header">
        <h2 id={`idea-lane-${status}`}>{STATUS_LABELS[status]}</h2>
        <span className="status-badge">{ideas.length}</span>
      </header>

      <div className="idea-board-lane-body">
        {ideas.length ? ideas.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            pending={pendingIdeaIds.has(idea.id)}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onMove={onMove}
          />
        )) : (
          <div className="idea-board-empty">이 상태의 Idea가 없습니다.</div>
        )}
      </div>
    </section>
  );
}

function IdeaCard({ idea, pending, onDragStart, onDragEnd, onMove }) {
  const allowedStatuses = IDEA_STATUSES.filter((status) => canTransitionIdeaStatus(idea.status, status));

  return (
    <article
      className={`idea-board-card${pending ? " is-pending" : ""}`}
      draggable={!pending}
      onDragStart={(event) => onDragStart(event, idea.id)}
      onDragEnd={onDragEnd}
    >
      <div className="stack-sm">
        <div className="section-heading idea-board-card-heading">
          <Link className="idea-board-card-title" href={`/idea-candidates/${idea.id}`}>
            {idea.title}
          </Link>
          <span className="status-badge">{idea.implementation_difficulty}</span>
        </div>
        <p className="idea-board-card-copy">{idea.one_liner}</p>
      </div>

      <div className="stack-sm idea-board-card-meta">
        <p className="muted">Problem Card: {idea.problem_card?.title || "source unavailable"}</p>
        {idea.projects?.length ? (
          <div className="idea-board-projects" aria-label="연결된 Research Projects">
            {idea.projects.map((project) => (
              <Link
                className="status-badge idea-board-project-badge"
                href={`/projects/${project.id}`}
                key={project.id}
              >
                {project.title}{project.status === "archived" ? " · archived" : ""}
              </Link>
            ))}
          </div>
        ) : <p className="muted">Research Project 미연결</p>}
        <p className="muted idea-list-date">최근 수정 {formatDate(idea.updated_at)}</p>
      </div>

      <label className="field stack-sm idea-board-move-control">
        <span>상태 이동</span>
        <select
          aria-label={`${idea.title} 상태 이동`}
          disabled={pending}
          value=""
          onChange={(event) => {
            if (event.target.value) void onMove(idea.id, event.target.value);
          }}
        >
          <option value="">이동할 상태 선택</option>
          {allowedStatuses.map((status) => (
            <option value={status} key={status}>{STATUS_LABELS[status]}</option>
          ))}
        </select>
      </label>
    </article>
  );
}

function compareByRecentUpdate(left, right) {
  const leftTime = Date.parse(left.updated_at || left.created_at || 0) || 0;
  const rightTime = Date.parse(right.updated_at || right.created_at || 0) || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;

  const leftId = String(left.id);
  const rightId = String(right.id);
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  return 0;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || fallback;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}. ${pad2(kst.getUTCMonth() + 1)}. ${pad2(kst.getUTCDate())}. ${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}:${pad2(kst.getUTCSeconds())} KST`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}
