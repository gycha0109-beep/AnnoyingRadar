import Link from "next/link";

import RawInputDashboard from "./raw-input-dashboard.js";
import { logout } from "../login/actions.js";

export default function PersonalWorkspace({ curatorRole = null, user }) {
  return (
    <main className="stack page-shell">
      <nav className="topbar">
        <div>
          <Link className="brand" href="/">어노잉 레이더</Link>
          <p className="muted user-line">{user.email ?? user.id}</p>
        </div>
        <div className="inline-actions">
          <Link className="button-link button-compact" href="/">Public Radar</Link>
          {curatorRole ? <Link className="button-link button-compact" href="/curator">Curator</Link> : null}
          <Link className="button-link button-compact" href="/projects">Projects</Link>
          <Link className="button-link button-compact" href="/problems">Problem Cards</Link>
          <Link className="button-link button-compact" href="/ideas">Idea Board</Link>
          <form action={logout}>
            <button className="button-secondary button-compact" type="submit">로그아웃</button>
          </form>
        </div>
      </nav>

      <header className="hero stack-sm">
        <p className="eyebrow">Personal Research Workspace</p>
        <h1>불만 원문에서 근거 기반 문제와 실행 후보까지 연결합니다.</h1>
        <p className="hero-copy">
          Raw Input을 분석해 Evidence와 개인 Problem Card를 만들고, Saved Problems, Idea Board, Research Projects에서 리서치 자산으로 관리합니다.
        </p>
      </header>

      <section className="card stack" aria-labelledby="research-assets-title">
        <div className="section-heading">
          <div className="stack-sm">
            <p className="eyebrow">Research Assets</p>
            <h2 id="research-assets-title">리서치 자산 바로가기</h2>
            <p className="muted">Public Radar에서 발견한 문제를 더 깊게 조사하거나, 기존 개인 분석 자산에 다시 진입합니다.</p>
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
