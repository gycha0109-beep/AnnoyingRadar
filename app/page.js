import Link from "next/link";

import RawInputDashboard from "./components/raw-input-dashboard.js";
import { logout } from "./login/actions.js";
import { createServerSupabaseClient } from "../lib/supabase/server.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let user = null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch {
    user = null;
  }

  if (!user) {
    return (
      <main className="stack landing-shell">
        <p className="eyebrow">Annoying Radar</p>
        <h1>불만 원문을 근거 기반 Problem Card와 리서치 자산으로 바꾸는 작업대</h1>
        <p className="hero-copy">
          리뷰, 커뮤니티 글, 인터뷰 메모에서 Pain Evidence를 확인하고 Problem Card, Idea Candidate, Research Project까지 연결합니다.
        </p>
        <div className="inline-actions">
          <Link className="button-link button-primary-link" href="/login">로그인하고 시작</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="stack page-shell">
      <nav className="topbar">
        <div>
          <Link className="brand" href="/">어노잉 레이더</Link>
          <p className="muted user-line">{user.email ?? user.id}</p>
        </div>
        <div className="inline-actions">
          <Link className="button-link button-compact" href="/projects">Projects</Link>
          <Link className="button-link button-compact" href="/problems">Problem Cards</Link>
          <Link className="button-link button-compact" href="/ideas">Idea Board</Link>
          <form action={logout}>
            <button className="button-secondary button-compact" type="submit">로그아웃</button>
          </form>
        </div>
      </nav>

      <header className="hero stack-sm">
        <p className="eyebrow">v0.3 · Personal Research Workspace</p>
        <h1>불만 원문에서 근거 기반 문제와 실행 후보까지 연결합니다.</h1>
        <p className="hero-copy">
          시작점은 여전히 Raw Input입니다. 분석으로 근거와 Problem Card를 만든 뒤 Saved Problems, Idea Board, Research Projects에서 개인 리서치 자산으로 관리합니다.
        </p>
      </header>

      <section className="card stack" aria-labelledby="research-assets-title">
        <div className="section-heading">
          <div className="stack-sm">
            <p className="eyebrow">Research Assets</p>
            <h2 id="research-assets-title">v0.3 리서치 자산 바로가기</h2>
            <p className="muted">분석 흐름을 선행 조건으로 만들지 않고, 축적된 결과에 다시 진입하는 관리 surface입니다.</p>
          </div>
        </div>
        <div className="inline-actions">
          <Link className="button-link button-compact" href="/problems">Saved Problems</Link>
          <Link className="button-link button-compact" href="/problems/compare">Problem Compare</Link>
          <Link className="button-link button-compact" href="/ideas">Idea Board</Link>
          <Link className="button-link button-compact" href="/projects">Research Projects</Link>
        </div>
      </section>

      <RawInputDashboard />
    </main>
  );
}
