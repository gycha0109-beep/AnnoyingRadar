import Link from "next/link";
import { createServerSupabaseClient } from "../lib/supabase/server.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let userId = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {}

  return (
    <main className="stack">
      <div><p className="muted">Phase 0 · 실행 가능 기준선</p><h1>어노잉 레이더</h1><p>불만 텍스트를 근거가 붙은 문제 카드로 정리합니다.</p></div>
      <section className="card stack"><p>인증 상태: {userId ? "로그인됨" : "로그아웃"}</p><p className="muted">Raw Input 사용자 화면은 Phase 1에서 연결합니다.</p></section>
      <Link href="/login">로그인 화면</Link>
    </main>
  );
}
