import Link from "next/link";
import { redirect } from "next/navigation";

import SourceAdmissionIndependentAudit from "../../../components/source-admission-independent-audit.js";
import { getSourceAdmissionIndependentAudit } from "../../../../lib/sources/service.mjs";
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

export default async function SourceAdmissionAuditPage() {
  const { user, role, serviceClient } = await loadCuratorContext();
  const audit = await getSourceAdmissionIndependentAudit(serviceClient);

  return (
    <main className="curator-shell source-lab-shell">
      <nav className="curator-topbar">
        <div>
          <Link className="curator-brand" href="/curator/sources">Source Lab</Link>
          <p>{user.email ?? user.id} · {role}</p>
        </div>
        <div className="curator-nav-actions">
          <Link href="/curator/sources/admission">Admission Queue</Link>
          <Link href="/curator/sources">Sources</Link>
          <Link href="/curator">Publication Queue</Link>
        </div>
      </nav>

      <header className="curator-hero">
        <div>
          <p className="curator-kicker">Phase 15.5E · Independent Human Audit</p>
          <h1>“REVIEW 7개가 맞는가?”를 운영 gate와 분리해서 검증합니다.</h1>
          <p>
            현재 admission regex를 자기 자신으로 재검증하지 않습니다. Boundary 전수검토,
            별도 high-recall false-negative sweep, 고정 seed random control을 사람이 직접 판정합니다.
          </p>
        </div>
      </header>

      <section className="source-lab-panel">
        <p className="curator-kicker">Audit isolation</p>
        <h2>이 화면의 판정은 제품 authority가 아닙니다.</h2>
        <p className="source-lab-copy">
          Blind 120은 서버에서 처음부터 제외됩니다. 사람의 audit 판정은 production DB에 저장하지 않고
          현재 브라우저 localStorage에만 기록합니다. 원문은 canonical URL을 수동으로 열 수 있으며 자동 full-body crawler는 실행하지 않습니다.
        </p>
      </section>

      <SourceAdmissionIndependentAudit audit={audit} />
    </main>
  );
}
