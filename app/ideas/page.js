import Link from "next/link";
import { redirect } from "next/navigation";

import { loadIdeaBoardOverview } from "../../lib/ideas/board-service.mjs";
import { createServerSupabaseClient } from "../../lib/supabase/server.js";
import { createServiceClient } from "../../lib/supabase/service.js";
import IdeaBoard from "./idea-board.js";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function IdeasPage({ searchParams }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) redirect("/login");

  const resolvedSearchParams = await searchParams;
  const rawProjectId = resolvedSearchParams?.project;
  const projectId = typeof rawProjectId === "string" && UUID_PATTERN.test(rawProjectId)
    ? rawProjectId.toLowerCase()
    : null;

  if (rawProjectId && !projectId) redirect("/ideas");

  const serviceClient = createServiceClient();
  const board = await loadIdeaBoardOverview(serviceClient, user.id, { projectId });
  if (board.invalid_project) redirect("/ideas");

  return (
    <main className="stack page-shell idea-board-page">
      <nav className="topbar">
        <div>
          <Link className="brand" href="/">어노잉 레이더</Link>
          <p className="muted user-line">Idea Candidate Board</p>
        </div>
        <div className="inline-actions">
          <Link className="button-link" href="/projects">Projects</Link>
          <Link className="button-link" href="/problems">Problem Cards</Link>
          <Link className="button-link" href="/">대시보드</Link>
        </div>
      </nav>

      <header className="hero stack-sm">
        <p className="eyebrow">Idea Board</p>
        <h1>Idea Candidate 의사결정 보드</h1>
        <p className="hero-copy">
          기존 Idea lifecycle을 Kanban으로 조회하고 상태를 변경합니다.
          Project는 필터링 컨텍스트일 뿐이며 별도 Project 상태나 점수·순위를 만들지 않습니다.
        </p>
        {board.selected_project ? (
          <div className="inline-actions">
            <span className="status-badge">Project: {board.selected_project.title}</span>
            <Link className="button-link button-compact" href={`/projects/${board.selected_project.id}`}>
              Project 열기
            </Link>
          </div>
        ) : null}
      </header>

      <IdeaBoard
        initialIdeas={board.ideas}
        projects={board.projects}
        selectedProjectId={board.selected_project?.id ?? null}
      />
    </main>
  );
}
