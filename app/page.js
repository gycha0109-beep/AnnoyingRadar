import Link from "next/link";

import { listPublishedPublicProblems } from "../lib/radar/service.mjs";
import { createServerSupabaseClient } from "../lib/supabase/server.js";

export const dynamic = "force-dynamic";

const CATEGORIES = ["배달", "취업", "운동", "금융", "쇼핑", "여행"];

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formatPublishedAt(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export default async function HomePage({ searchParams }) {
  const params = await searchParams;
  const q = String(firstValue(params?.q) ?? "").trim().slice(0, 160) || null;
  const category = String(firstValue(params?.category) ?? "").trim().slice(0, 120) || null;

  const supabase = await createServerSupabaseClient();
  const [{ data: authData }, problems] = await Promise.all([
    supabase.auth.getUser(),
    listPublishedPublicProblems(supabase, { q, category, limit: 30 }),
  ]);
  const user = authData.user ?? null;

  const resultTitle = q
    ? `“${q}” 관련 문제`
    : category
      ? `${category}에서 발견된 문제`
      : "최근 발견된 문제";

  return (
    <main className="radar-shell">
      <nav className="radar-topbar" aria-label="주요 탐색">
        <Link className="radar-brand" href="/">어노잉 레이더</Link>
        <div className="radar-nav-actions">
          {user ? (
            <Link className="radar-nav-link radar-nav-primary" href="/workspace">내 작업공간</Link>
          ) : (
            <Link className="radar-nav-link" href="/login">로그인</Link>
          )}
        </div>
      </nav>

      <section className="radar-hero" aria-labelledby="radar-title">
        <p className="radar-kicker">Problem Discovery Radar</p>
        <h1 id="radar-title">사람들이 요즘, 무엇을 불편해하고 있을까요?</h1>
        <p className="radar-lead">
          공개된 사용자 의견 속에 흩어진 불편을 모아, 반복해서 나타나는 문제를 근거와 함께 보여드립니다.
        </p>

        <form className="radar-search" action="/" method="get" role="search">
          <label className="sr-only" htmlFor="radar-search-input">문제 검색</label>
          <input
            id="radar-search-input"
            name="q"
            defaultValue={q ?? ""}
            placeholder="어떤 불편이 궁금하신가요? 예: 배달, 헬스장, 취업"
            maxLength={160}
          />
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <button type="submit">검색</button>
        </form>

        <div className="radar-categories" aria-label="분야별 탐색">
          <Link className={!category ? "radar-chip is-active" : "radar-chip"} href={q ? `/?q=${encodeURIComponent(q)}` : "/"}>전체</Link>
          {CATEGORIES.map((item) => {
            const href = q
              ? `/?q=${encodeURIComponent(q)}&category=${encodeURIComponent(item)}`
              : `/?category=${encodeURIComponent(item)}`;
            return (
              <Link className={category === item ? "radar-chip is-active" : "radar-chip"} href={href} key={item}>
                {item}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="radar-results" aria-labelledby="radar-results-title">
        <div className="radar-section-heading">
          <div>
            <p className="radar-section-label">Explore</p>
            <h2 id="radar-results-title">{resultTitle}</h2>
          </div>
          {(q || category) ? (
            <Link className="radar-clear-link" href="/">검색 초기화</Link>
          ) : null}
        </div>

        {problems.length > 0 ? (
          <div className="radar-problem-list">
            {problems.map((problem) => (
              <Link className="radar-problem-card" href={`/radar/problems/${problem.id}`} key={problem.id}>
                <div className="radar-problem-main">
                  <div className="radar-problem-meta">
                    {problem.category ? <span>{problem.category}</span> : null}
                    <span>{problem.evidence_count}건의 공개 근거</span>
                    {problem.published_at ? <span>{formatPublishedAt(problem.published_at)}</span> : null}
                  </div>
                  <h3>{problem.title}</h3>
                  <p>{problem.summary}</p>
                </div>
                <span className="radar-problem-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="radar-empty-state">
            <strong>{q || category ? "조건에 맞는 공개 문제가 아직 없습니다." : "아직 공개된 문제가 없습니다."}</strong>
            <p>
              어노잉 레이더는 검증된 Problem만 공개합니다. 운영자가 근거를 확인하고 publication gate를 통과한 문제부터 이곳에 표시됩니다.
            </p>
            {(q || category) ? <Link href="/">전체 문제 보기</Link> : null}
          </div>
        )}
      </section>

      <footer className="radar-footer">
        <p>어노잉 레이더는 인터넷 전체의 여론을 대표하지 않습니다. 관측하고 검증한 공개 근거의 범위 안에서 Problem을 보여드립니다.</p>
      </footer>
    </main>
  );
}
