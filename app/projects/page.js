import Link from "next/link";
import { redirect } from "next/navigation";

import { loadResearchProjectOverview } from "../../lib/research-projects/service.mjs";
import { createServerSupabaseClient } from "../../lib/supabase/server.js";
import { createServiceClient } from "../../lib/supabase/service.js";
import ProjectCreateForm from "./project-create-form.js";

export const dynamic = "force-dynamic";

export default async function ResearchProjectsPage({ searchParams }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) redirect("/login");

  const resolvedSearchParams = await searchParams;
  const status = resolvedSearchParams?.status === "archived" ? "archived" : "active";
  const serviceClient = createServiceClient();
  const projects = await loadResearchProjectOverview(serviceClient, user.id, { status });

  return (
    <main className="stack page-shell">
      <nav className="topbar">
        <div>
          <Link className="brand" href="/">어노잉 레이더</Link>
          <p className="muted user-line">Research Projects</p>
        </div>
        <div className="inline-actions">
          <Link className="button-link" href="/problems">Problem Cards</Link>
          <Link className="button-link" href="/ideas">Ideas</Link>
          <Link className="button-link" href="/">대시보드</Link>
        </div>
      </nav>

      <header className="hero stack-sm">
        <p className="eyebrow">Research Projects</p>
        <h1>검증할 문제와 아이디어를 조사 맥락으로 묶습니다.</h1>
        <p className="hero-copy">
          프로젝트는 입력이나 분석보다 먼저 만들 필요가 없습니다. 의미 있는 Saved Problem과 Idea Candidate가 생긴 뒤 조사 단위로 연결합니다.
        </p>
      </header>

      {status === "active" ? <ProjectCreateForm /> : null}

      <section className="card stack" aria-labelledby="research-project-list-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h2 id="research-project-list-title">
              {status === "active" ? "활성" : "보관"} Research Project {projects.length}개
            </h2>
          </div>
          <div className="inline-actions">
            <Link
              className={`button-link button-compact${status === "active" ? " button-primary-link" : ""}`}
              href="/projects"
            >
              활성
            </Link>
            <Link
              className={`button-link button-compact${status === "archived" ? " button-primary-link" : ""}`}
              href="/projects?status=archived"
            >
              보관
            </Link>
          </div>
        </div>

        {projects.length ? (
          <div className="research-project-list">
            {projects.map((project) => (
              <Link className="research-project-card stack-sm" href={`/projects/${project.id}`} key={project.id}>
                <div className="section-heading">
                  <div className="stack-sm">
                    <strong>{project.title}</strong>
                    <p>{project.purpose || "조사 목적 미입력"}</p>
                  </div>
                  <span className="status-badge">{project.status}</span>
                </div>
                <div className="research-project-counts">
                  <span>Saved Problems {project.linked_problem_count}</span>
                  <span>Ideas {project.linked_idea_count}</span>
                </div>
                <p className="muted">최근 활동 {formatDate(project.updated_at)}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>{status === "active" ? "활성 Research Project가 없습니다." : "보관된 Research Project가 없습니다."}</strong>
            <p className="muted">
              Saved Problem에서 새 프로젝트를 만들거나, 이 화면에서 빈 조사 단위를 먼저 만든 뒤 자산을 연결할 수 있습니다.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ko-KR");
}
