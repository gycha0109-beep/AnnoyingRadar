import Link from "next/link";
import { redirect } from "next/navigation";

import BlindEvaluationControl from "../../components/blind-evaluation-control.js";
import NaverBlogSourceSearchForm from "../../components/naver-blog-source-search-form.js";
import ThreadsSourceSearchForm from "../../components/threads-source-search-form.js";
import { getBlindEvaluationProgress } from "../../../lib/sources/blind-evaluation.mjs";
import { getDiscoveryQueryPlanSummary } from "../../../lib/sources/discovery-query-plan.mjs";
import { getGoldCampaignProgress } from "../../../lib/sources/gold-campaign.mjs";
import { getSourceAdmissionStats, listRecentSourceIngestionRuns } from "../../../lib/sources/service.mjs";
import { createServerSupabaseClient } from "../../../lib/supabase/server.js";
import { createServiceClient } from "../../../lib/supabase/service.js";

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

function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export default async function CuratorSourcesPage() {
  const { user, role, serviceClient } = await loadCuratorContext();
  const [runs, campaignProgress, evaluation, admission] = await Promise.all([
    listRecentSourceIngestionRuns(serviceClient, { limit: 20 }),
    getGoldCampaignProgress(serviceClient),
    getBlindEvaluationProgress(serviceClient),
    getSourceAdmissionStats(serviceClient),
  ]);
  const discoveryPlan = getDiscoveryQueryPlanSummary();
  const naverConfigured = Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

  return (
    <main className="curator-shell source-lab-shell">
      <nav className="curator-topbar">
        <div>
          <Link className="curator-brand" href="/curator">Radar Curator</Link>
          <p>{user.email ?? user.id} · {role}</p>
        </div>
        <div className="curator-nav-actions">
          <Link href="/curator">Publication Queue</Link>
          <Link href="/">Public Radar</Link>
          <Link href="/workspace">Workspace</Link>
        </div>
      </nav>

      <header className="curator-hero">
        <div>
          <p className="curator-kicker">Source Lab · Phase 15.8A</p>
          <h1>탐지 반경은 넓히고, 명백한 쓰레기는 DB에 들어오기 전에 버립니다.</h1>
          <p>Discovery Prefilter는 high-recall hard reject만 수행합니다. 애매한 Source는 유지하고 기존 Source Admission이 precision authority를 계속 가집니다.</p>
        </div>
      </header>

      <section className="source-lab-panel" aria-labelledby="discovery-title">
        <div className="source-lab-heading">
          <div><p className="curator-kicker">High-Recall Discovery</p><h2 id="discovery-title">운영 Source 공급</h2></div>
          <span>{discoveryPlan.query_count} query definitions</span>
        </div>
        <div className="source-run-metrics">
          <span>domains <strong>{discoveryPlan.domain_count}</strong></span>
          <span>families <strong>{discoveryPlan.family_count}</strong></span>
          <span>full-plan opportunities <strong>{discoveryPlan.result_opportunity_count}</strong></span>
          <span>discovery observed <strong>{admission.discovery_pool}</strong></span>
          <span>operational admission pool <strong>{admission.eligible}</strong></span>
        </div>
        <p className="source-lab-copy">기본 live batch는 24 requests × 50 결과로 제한됩니다. query별 cheap-reject/new/duplicate/admission-candidate 수율을 누적하고 다음 batch allocation에 반영합니다. 배포만으로 campaign이 자동 실행되지는 않습니다.</p>
      </section>

      <section className="source-lab-panel" aria-labelledby="campaign-title">
        <div className="source-lab-heading">
          <div><p className="curator-kicker">Historical Calibration Acquisition</p><h2 id="campaign-title">Gold 수집 캠페인</h2></div>
          <span>{campaignProgress.completed_queries} / {campaignProgress.planned_queries} queries</span>
        </div>
        <div className="source-run-metrics">
          <span>unique pool <strong>{campaignProgress.unique_signal_pool}</strong></span>
          <span>fetched <strong>{campaignProgress.fetched_total}</strong></span>
          <span>new <strong>{campaignProgress.inserted_total}</strong></span>
          <span>duplicate <strong>{campaignProgress.duplicate_total}</strong></span>
          <span>failed <strong>{campaignProgress.failed_runs}</strong></span>
        </div>
        <p className={campaignProgress.unique_signal_pool >= 600 ? "source-configured" : "source-warning"}>
          {campaignProgress.unique_signal_pool >= 600 ? "Calibration acquisition gate passed." : "Historical calibration pool is below target."}
        </p>
      </section>

      <section className="source-lab-grid">
        <div className="source-lab-panel">
          <p className="curator-kicker">No-LLM Source Admission</p>
          <h2>Operational Source-intent admission</h2>
          <div className="source-run-metrics">
            <span>Gold pool <strong>{admission.campaign_pool}</strong></span>
            <span>discovery pool <strong>{admission.discovery_pool}</strong></span>
            <span>blind excluded <strong>{admission.blind_excluded}</strong></span>
            <span>operational <strong>{admission.eligible}</strong></span>
            <span>candidate <strong>{admission.candidate}</strong></span>
            <span>review <strong>{admission.review}</strong></span>
            <span>reject <strong>{admission.reject}</strong></span>
            <span>full-context <strong>{admission.full_context_required}</strong></span>
          </div>
          <p className="source-lab-copy">운영 admission pool은 Gold development supply와 Discovery observations를 합친 뒤 Blind 120을 제외합니다. Independent audit과 Blind sampling 자체는 기존 Gold authority에 고정되어 있습니다.</p>
          <div className="inline-actions">
            <Link className="button-link button-compact" href="/curator/sources/admission">Admission queue 보기</Link>
            <Link className="button-link button-compact" href="/curator/sources/audit">Independent audit 열기</Link>
          </div>
        </div>

        <div className="source-lab-panel">
          <p className="curator-kicker">Blind Human Evaluation</p>
          <h2>Representative 60 + Challenge 60</h2>
          <p className="source-lab-copy">Blind 120은 기존 authority를 유지합니다. Discovery supply는 이 평가 세트의 membership을 변경하지 않습니다.</p>
          <BlindEvaluationControl evaluation={evaluation} />
        </div>
      </section>

      <section className="source-lab-panel">
        <p className="curator-kicker">Historical / Experimental</p>
        <h2>AI Silver는 active admission path가 아닙니다.</h2>
        <p className="source-lab-copy">Phase 15.5D semantic/Silver 코드는 재현성과 역사적 검증을 위해 남겨두지만, Source ingestion마다 외부 LLM을 호출하는 운영 경로로 사용하지 않습니다. 유료 Silver runner도 명시적 opt-in 없이는 실행되지 않습니다.</p>
      </section>

      <section className="source-adapter-grid" aria-label="Source adapters">
        <NaverBlogSourceSearchForm configured={naverConfigured} />
        <ThreadsSourceSearchForm configured={Boolean(process.env.THREADS_ACCESS_TOKEN)} />
      </section>

      <section className="source-lab-panel">
        <div className="source-lab-heading">
          <div><p className="curator-kicker">Runs</p><h2>최근 수집 실행</h2></div>
          <span>{runs.length}개</span>
        </div>
        {runs.length > 0 ? (
          <div className="source-run-list">
            {runs.map((run) => (
              <article key={run.id}>
                <div className="source-run-title"><strong>{run.query_text}</strong><span className={`source-run-status source-run-status-${run.status}`}>{run.status}</span></div>
                <p>{run.source_platform} · {run.search_type} · {run.search_mode} · limit {run.requested_limit}</p>
                <div className="source-run-metrics compact">
                  <span>fetched <strong>{run.fetched_count}</strong></span>
                  <span>new <strong>{run.inserted_count}</strong></span>
                  <span>dup <strong>{run.duplicate_count}</strong></span>
                  {run.discovery_policy_version ? <span>cheap reject <strong>{run.discovery_reject_count}</strong></span> : null}
                  {run.discovery_policy_version ? <span>candidate <strong>{run.admission_candidate_count}</strong></span> : null}
                </div>
                <small>{formatTime(run.started_at)}</small>
              </article>
            ))}
          </div>
        ) : <p className="source-empty">아직 수집 실행 기록이 없습니다.</p>}
      </section>
    </main>
  );
}
