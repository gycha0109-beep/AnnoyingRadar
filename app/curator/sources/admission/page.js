import Link from "next/link";
import { redirect } from "next/navigation";

import { listSourceAdmissionQueue } from "../../../../lib/sources/service.mjs";
import { createServerSupabaseClient } from "../../../../lib/supabase/server.js";
import { createServiceClient } from "../../../../lib/supabase/service.js";

export const dynamic = "force-dynamic";

async function loadCuratorContext() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const { data: curator, error } = await serviceClient
    .from("ar_radar_curators")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!curator?.role) redirect("/workspace");
  return { user, role: curator.role, serviceClient };
}

export default async function SourceAdmissionPage() {
  const { user, role, serviceClient } = await loadCuratorContext();
  const queue = await listSourceAdmissionQueue(serviceClient, { limit: 100 });

  return (
    <main className="curator-shell source-lab-shell">
      <nav className="curator-topbar">
        <div>
          <Link className="curator-brand" href="/curator/sources">Source Lab</Link>
          <p>{user.email ?? user.id} · {role}</p>
        </div>
        <div className="curator-nav-actions">
          <Link href="/curator/sources">Sources</Link>
          <Link href="/curator">Publication Queue</Link>
        </div>
      </nav>

      <header className="curator-hero">
        <div>
          <p className="curator-kicker">Phase 15.5E · No-LLM Source Admission</p>
          <h1>제목이 애매한 Source만 원문 확인 대상으로 남깁니다.</h1>
          <p>NAVER 검색 snippet은 retrieval artifact입니다. snippet의 불편 문장만으로 candidate로 승격하지 않습니다.</p>
        </div>
      </header>

      <section className="source-lab-panel">
        <div className="source-lab-heading">
          <div><p className="curator-kicker">Selective Context Queue</p><h2>Candidate / Review</h2></div>
          <span>{queue.length}개 표시</span>
        </div>
        <p className="source-lab-copy">candidate는 제목 자체가 명시적 complaint인 경우입니다. review는 제목만으로 중심성을 확정할 수 없어 canonical page 확인이 필요한 경우입니다.</p>

        {queue.length > 0 ? (
          <div className="source-run-list">
            {queue.map((signal) => (
              <article key={signal.id}>
                <div className="source-run-title">
                  <strong>{signal.admission.title || "제목 없음"}</strong>
                  <span className={`source-run-status source-run-status-${signal.admission.decision === "candidate" ? "completed" : "running"}`}>
                    {signal.admission.decision}
                  </span>
                </div>
                <p>{signal.admission.reason_codes.join(", ")}</p>
                <p>{String(signal.raw_text ?? "").slice(0, 420)}</p>
                {signal.canonical_url ? (
                  <a href={signal.canonical_url} target="_blank" rel="noreferrer">원문 열기</a>
                ) : null}
              </article>
            ))}
          </div>
        ) : <p className="source-empty">확인할 Source가 없습니다.</p>}
      </section>
    </main>
  );
}
