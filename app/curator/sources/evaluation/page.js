import Link from "next/link";
import { redirect } from "next/navigation";

import BlindEvaluationCard from "../../../components/blind-evaluation-card.js";
import { getNextBlindEvaluation } from "../../../../lib/sources/blind-evaluation.mjs";
import { createServerSupabaseClient } from "../../../../lib/supabase/server.js";
import { createServiceClient } from "../../../../lib/supabase/service.js";

export const dynamic = "force-dynamic";

async function loadContext() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;
  if (!user) redirect("/login");
  const serviceClient = createServiceClient();
  const { data: curator, error } = await serviceClient.from("ar_radar_curators").select("role").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!curator?.role) redirect("/workspace");
  return { user, role: curator.role, serviceClient };
}

export default async function BlindEvaluationPage() {
  const { user, role, serviceClient } = await loadContext();
  const { progress, sample } = await getNextBlindEvaluation(serviceClient);

  return (
    <main className="curator-shell source-lab-shell">
      <nav className="curator-topbar">
        <div>
          <Link className="curator-brand" href="/curator/sources">Source Lab</Link>
          <p>{user.email ?? user.id} · {role}</p>
        </div>
        <div className="curator-nav-actions"><Link href="/curator/sources">돌아가기</Link><Link href="/">Public Radar</Link></div>
      </nav>

      <header className="curator-hero">
        <div>
          <p className="curator-kicker">Phase 15.5D · Blind Human Evaluation</p>
          <h1>기계 답을 보지 않고 120개만 판정합니다.</h1>
          <p>Representative 60 + Challenge 60. 이 페이지는 classifier, Silver, confidence를 조회하지 않습니다.</p>
        </div>
      </header>

      <section className="source-lab-panel">
        <div className="source-lab-heading">
          <div><p className="curator-kicker">Progress</p><h2>{progress.labeled} / {progress.target}</h2></div>
          <span>{progress.status}</span>
        </div>
        <div className="source-run-metrics">
          <span>remaining <strong>{progress.remaining}</strong></span>
          <span>representative <strong>{progress.representative}</strong></span>
          <span>challenge <strong>{progress.challenge}</strong></span>
        </div>
      </section>

      {!progress.initialized ? (
        <section className="source-lab-panel"><p>Source Lab에서 Blind evaluation set을 먼저 고정하십시오.</p></section>
      ) : progress.status === "locked" ? (
        <section className="source-lab-panel"><h2>Human evaluation locked.</h2><p>이제 classifier evaluation 단계에서만 이 set을 사용할 수 있습니다.</p></section>
      ) : sample ? (
        <BlindEvaluationCard sample={sample} />
      ) : (
        <section className="source-lab-panel"><h2>120개 라벨링 완료</h2><p>Source Lab으로 돌아가 Human evaluation을 잠그십시오.</p></section>
      )}
    </main>
  );
}
