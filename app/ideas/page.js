import Link from "next/link";
import { redirect } from "next/navigation";

import { loadIdeaOverview } from "../../lib/ideas/service.mjs";
import { createServerSupabaseClient } from "../../lib/supabase/server.js";
import { createServiceClient } from "../../lib/supabase/service.js";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) redirect("/login");

  const serviceClient = createServiceClient();
  const ideas = await loadIdeaOverview(serviceClient, user.id);

  return (
    <main className="stack page-shell">
      <nav className="topbar">
        <div>
          <Link className="brand" href="/">어노잉 레이더</Link>
          <p className="muted user-line">Idea Candidate 목록</p>
        </div>
        <Link className="button-link" href="/">대시보드</Link>
      </nav>

      <header className="hero stack-sm">
        <p className="eyebrow">Ideas</p>
        <h1>검토 중인 Idea Candidate</h1>
        <p className="hero-copy">
          확정된 Problem Card에서 생성된 아이디어를 다시 열어 수정하고 상태를 관리합니다.
          이 화면은 단순 목록이며 보드·점수·순위 기능은 포함하지 않습니다.
        </p>
      </header>

      <section className="card stack" aria-labelledby="idea-list-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Review Queue</p>
            <h2 id="idea-list-title">Idea Candidate {ideas.length}개</h2>
          </div>
        </div>

        {ideas.length ? (
          <div className="idea-list">
            {ideas.map((idea) => (
              <Link className="idea-list-item" href={`/idea-candidates/${idea.id}`} key={idea.id}>
                <div className="section-heading">
                  <div className="stack-sm">
                    <strong>{idea.title}</strong>
                    <p>{idea.one_liner}</p>
                  </div>
                  <div className="detail-statuses">
                    <span className="status-badge">{idea.status}</span>
                    <span className="status-badge">{idea.implementation_difficulty}</span>
                  </div>
                </div>
                <p className="muted">
                  Problem Card: {idea.problem_card?.title || "source unavailable"}
                </p>
                <p className="muted idea-list-date">최근 수정 {formatDate(idea.updated_at)}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>아직 Idea Candidate가 없습니다.</strong>
            <p className="muted">완료된 Problem Card에서 Idea Candidate를 생성하면 여기에 표시됩니다.</p>
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