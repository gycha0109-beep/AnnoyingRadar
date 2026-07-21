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
        <h1>불만 텍스트를 근거가 붙은 문제 카드로 바꾸는 작업대</h1>
        <p className="hero-copy">
          리뷰, 커뮤니티 글, 인터뷰 메모를 저장하고 실제 불편의 근거를 단계적으로 검토합니다.
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
        <form action={logout}>
          <button className="button-secondary button-compact" type="submit">로그아웃</button>
        </form>
      </nav>

      <header className="hero stack-sm">
        <p className="eyebrow">Phase 1 · Raw Input Vertical Slice</p>
        <h1>실제 불편이 담긴 원문부터 고정합니다.</h1>
        <p className="hero-copy">
          저장된 원문은 다음 단계의 Evidence 추출 기준선입니다. 출처와 언어를 함께 남기고 최근 입력으로 다시 진입할 수 있습니다.
        </p>
      </header>

      <RawInputDashboard />
    </main>
  );
}
