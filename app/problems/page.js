import Link from "next/link";
import { redirect } from "next/navigation";

import {
  normalizeSavedProblemCategoryFilter,
  savedProblemLibraryHref,
} from "../../lib/saved-problems/category.mjs";
import {
  loadSavedProblemCategoryOverview,
  loadSavedProblemOverview,
} from "../../lib/saved-problems/service.mjs";
import { createServerSupabaseClient } from "../../lib/supabase/server.js";
import { createServiceClient } from "../../lib/supabase/service.js";
import ProjectLinkControl from "./project-link-control.js";

export const dynamic = "force-dynamic";

export default async function SavedProblemsPage({ searchParams }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) redirect("/login");

  const resolvedSearchParams = await searchParams;
  const status = resolvedSearchParams?.status === "archived" ? "archived" : "active";
  const rawCategory = resolvedSearchParams?.category;
  const category = normalizeSavedProblemCategoryFilter(rawCategory);
  if (rawCategory && !category) redirect(savedProblemLibraryHref({ status }));

  const serviceClient = createServiceClient();
  const [savedProblems, categories] = await Promise.all([
    loadSavedProblemOverview(serviceClient, user.id, { status, category }),
    loadSavedProblemCategoryOverview(serviceClient, user.id),
  ]);

  return (
    <main className="stack page-shell">
      <nav className="topbar">
        <div>
          <Link className="brand" href="/">어노잉 레이더</Link>
          <p className="muted user-line">Saved Problem Library</p>
        </div>
        <div className="inline-actions">
          <Link className="button-link" href="/projects">Projects</Link>
          <Link className="button-link" href="/ideas">Idea Board</Link>
          <Link className="button-link" href="/">대시보드</Link>
        </div>
      </nav>

      <header className="hero stack-sm">
        <p className="eyebrow">Saved Problems</p>
        <h1>확정한 Problem Card를 다시 꺼내는 라이브러리</h1>
        <p className="hero-copy">
          Problem Card의 근거와 본문은 그대로 유지하고, 개인 관리용 카테고리·메모·보관 상태만 별도로 관리합니다.
        </p>
      </header>

      <section className="card stack" aria-labelledby="saved-problem-category-title">
        <div className="section-heading">
          <div className="stack-sm">
            <p className="eyebrow">v0.3 · Category Archive</p>
            <h2 id="saved-problem-category-title">카테고리별 Problem Archive</h2>
            <p className="muted">
              별도 카테고리 테이블이나 taxonomy를 만들지 않고 Saved Problem의 기존 category 값을 그대로 탐색 축으로 사용합니다.
            </p>
          </div>
          {category ? <span className="status-badge">선택: {category}</span> : null}
        </div>
        <div className="inline-actions">
          <Link
            className={`button-link button-compact${category ? "" : " button-primary-link"}`}
            href={savedProblemLibraryHref({ status })}
          >
            전체
          </Link>
          {categories.map((item) => {
            const count = status === "archived" ? item.archived_count : item.active_count;
            if (count === 0 && item.category !== category) return null;
            return (
              <Link
                className={`button-link button-compact${item.category === category ? " button-primary-link" : ""}`}
                href={savedProblemLibraryHref({ status, category: item.category })}
                key={item.category}
              >
                {item.category} ({count})
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card stack" aria-labelledby="saved-problem-library-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h2 id="saved-problem-library-title">
              {status === "active" ? "활성" : "보관"} Saved Problem {savedProblems.length}개
              {category ? ` · ${category}` : ""}
            </h2>
          </div>
          <div className="inline-actions">
            <Link className="button-link button-primary-link button-compact" href="/problems/compare">
              Problem Card 비교
            </Link>
            <Link
              className={`button-link button-compact${status === "active" ? " button-primary-link" : ""}`}
              href={savedProblemLibraryHref({ status: "active", category })}
            >
              활성
            </Link>
            <Link
              className={`button-link button-compact${status === "archived" ? " button-primary-link" : ""}`}
              href={savedProblemLibraryHref({ status: "archived", category })}
            >
              보관
            </Link>
          </div>
        </div>

        <div className="notice">
          비교 기능은 Saved 여부와 관계없이 현재 계정의 confirmed Problem Card를 대상으로 합니다. Saved 메타데이터는 비교표에 보조 정보로 표시됩니다.
        </div>

        {savedProblems.length ? (
          <div className="saved-problem-list">
            {savedProblems.map((savedProblem) => {
              const problemCard = savedProblem.problem_card;
              return (
                <article className="saved-problem-card stack-sm" key={savedProblem.problem_candidate_id}>
                  <div className="section-heading">
                    <div className="stack-sm">
                      <p className="eyebrow">{savedProblem.category || "미분류"}</p>
                      <h3>{problemCard?.title || "Problem Card unavailable"}</h3>
                    </div>
                    <span className="status-badge">{savedProblem.status}</span>
                  </div>

                  <p>{problemCard?.summary || "요약 없음"}</p>
                  {savedProblem.memo ? <p className="saved-problem-memo">{savedProblem.memo}</p> : null}

                  <div className="saved-problem-meta">
                    <span>Evidence {problemCard?.evidence_count ?? "-"}</span>
                    <span>강도 {problemCard?.intensity_level ?? "unknown"}</span>
                    <span>반복 {problemCard?.repeat_pattern_level ?? "unknown"}</span>
                    <span>명확도 {problemCard?.clarity_level ?? "unknown"}</span>
                  </div>

                  <div className="inline-actions">
                    <Link
                      className="button-link"
                      href={`/problem-candidates/${savedProblem.problem_candidate_id}#saved-problem`}
                    >
                      Problem Card 열기
                    </Link>
                    <Link
                      className="button-link button-compact"
                      href={`/problem-candidates/${savedProblem.problem_candidate_id}`}
                    >
                      Idea Candidate 보기
                    </Link>
                  </div>

                  <ProjectLinkControl
                    problemCandidateId={savedProblem.problem_candidate_id}
                    savedStatus={savedProblem.status}
                  />
                  <p className="muted saved-problem-date">최근 관리 {formatDate(savedProblem.updated_at)}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <strong>
              {category
                ? `${category} 카테고리에 ${status === "active" ? "활성" : "보관"} Saved Problem이 없습니다.`
                : status === "active"
                  ? "저장된 Problem Card가 없습니다."
                  : "보관된 Problem Card가 없습니다."}
            </strong>
            <p className="muted">
              {category
                ? "다른 카테고리를 선택하거나 전체 목록으로 돌아가세요."
                : "완료된 Problem Card 상세에서 저장하면 이 라이브러리에서 다시 찾을 수 있습니다."}
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
