import Link from "next/link";
import { notFound } from "next/navigation";

import { loadPublishedPublicProblemDetail } from "../../../../lib/radar/service.mjs";
import { createServerSupabaseClient } from "../../../../lib/supabase/server.js";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sourceName(evidence) {
  return evidence.source_label || evidence.source_type || "공개 출처";
}

export default async function PublicProblemDetailPage({ params }) {
  const { publicProblemId } = await params;
  if (!UUID_RE.test(publicProblemId ?? "")) notFound();

  const supabase = await createServerSupabaseClient();
  const [{ data: authData }, detail] = await Promise.all([
    supabase.auth.getUser(),
    loadPublishedPublicProblemDetail(supabase, publicProblemId),
  ]);
  if (!detail) notFound();

  const { problem, evidence } = detail;
  const user = authData.user ?? null;

  return (
    <main className="radar-shell radar-detail-shell">
      <nav className="radar-topbar" aria-label="주요 탐색">
        <Link className="radar-brand" href="/">어노잉 레이더</Link>
        <div className="radar-nav-actions">
          <Link className="radar-nav-link" href="/">문제 탐색</Link>
          {user ? (
            <Link className="radar-nav-link radar-nav-primary" href="/workspace">내 작업공간</Link>
          ) : (
            <Link className="radar-nav-link" href="/login">로그인</Link>
          )}
        </div>
      </nav>

      <article className="radar-detail">
        <Link className="radar-back-link" href={problem.category ? `/?category=${encodeURIComponent(problem.category)}` : "/"}>
          ← 문제 탐색으로 돌아가기
        </Link>

        <header className="radar-detail-header">
          <div className="radar-problem-meta">
            {problem.category ? <span>{problem.category}</span> : null}
            <span>{problem.evidence_count}건의 공개 근거에서 확인</span>
          </div>
          <h1>{problem.title}</h1>
          <p className="radar-detail-summary">{problem.summary}</p>
        </header>

        {(problem.target_user || problem.situation) ? (
          <section className="radar-context" aria-labelledby="radar-context-title">
            <h2 id="radar-context-title">어떤 상황의 문제인가요?</h2>
            <dl>
              {problem.target_user ? (
                <div>
                  <dt>주로 겪는 사람</dt>
                  <dd>{problem.target_user}</dd>
                </div>
              ) : null}
              {problem.situation ? (
                <div>
                  <dt>발생 상황</dt>
                  <dd>{problem.situation}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        <section className="radar-evidence-section" aria-labelledby="radar-evidence-title">
          <div className="radar-section-heading">
            <div>
              <p className="radar-section-label">Evidence</p>
              <h2 id="radar-evidence-title">사람들은 실제로 이렇게 말했습니다</h2>
            </div>
            <span className="radar-evidence-count">{evidence.length}건</span>
          </div>

          <div className="radar-evidence-list">
            {evidence.map((item) => (
              <figure className="radar-evidence-card" key={item.id}>
                <blockquote>“{item.excerpt}”</blockquote>
                <figcaption>
                  <span>{sourceName(item)}</span>
                  {item.source_url ? (
                    <a href={item.source_url} target="_blank" rel="noreferrer">원문 보기 ↗</a>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="radar-next-step">
          <div>
            <p className="radar-section-label">Keep exploring</p>
            <h2>이 문제와 비슷한 불편을 더 찾아보세요.</h2>
          </div>
          <Link className="radar-nav-link radar-nav-primary" href={problem.category ? `/?category=${encodeURIComponent(problem.category)}` : "/"}>
            {problem.category ? `${problem.category} 문제 더 보기` : "다른 문제 보기"}
          </Link>
        </section>
      </article>

      <footer className="radar-footer">
        <p>이 Problem은 공개 가능한 Evidence snapshot에 근거합니다. 원문 링크가 제공된 근거는 해당 출처에서 직접 확인할 수 있습니다.</p>
      </footer>
    </main>
  );
}
