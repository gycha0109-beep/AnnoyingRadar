import Link from "next/link";
import { redirect } from "next/navigation";

import CuratorCreateProblemForm from "../components/curator-create-problem-form.js";
import { listAdminPublicProblems } from "../../lib/radar/service.mjs";
import { createServerSupabaseClient } from "../../lib/supabase/server.js";
import { createServiceClient } from "../../lib/supabase/service.js";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "published", "archived"];

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

export default async function CuratorConsolePage({ searchParams }) {
  const params = await searchParams;
  const requestedStatus = typeof params?.status === "string" ? params.status : null;
  const status = STATUSES.includes(requestedStatus) ? requestedStatus : null;
  const { user, role, serviceClient } = await loadCuratorContext();
  const problems = await listAdminPublicProblems(serviceClient, { status, limit: 50 });

  const allProblems = status ? await listAdminPublicProblems(serviceClient, { limit: 50 }) : problems;
  const counts = Object.fromEntries(STATUSES.map((item) => [
    item,
    allProblems.filter((problem) => problem.status === item).length,
  ]));

  return (
    <main className="curator-shell">
      <nav className="curator-topbar">
        <div>
          <Link className="curator-brand" href="/curator">Radar Curator</Link>
          <p>{user.email ?? user.id} · {role}</p>
        </div>
        <div className="curator-nav-actions">
          <Link href="/">Public Radar</Link>
          <Link href="/workspace">Workspace</Link>
        </div>
      </nav>

      <header className="curator-hero">
        <div>
          <p className="curator-kicker">Publication Workflow</p>
          <h1>Public Problem을 검토하고 공개합니다.</h1>
          <p>Draft를 만들고 공개 가능한 Evidence와 lineage를 확인한 뒤 publication gate를 통과한 Problem만 Publish합니다.</p>
        </div>
      </header>

      <section className="curator-grid">
        <div className="curator-main-column">
          <div className="curator-section-heading">
            <div>
              <p className="curator-kicker">Queue</p>
              <h2>Public Problems</h2>
            </div>
            <div className="curator-status-tabs" aria-label="상태 필터">
              <Link className={!status ? "is-active" : ""} href="/curator">전체 <span>{allProblems.length}</span></Link>
              {STATUSES.map((item) => (
                <Link
                  className={status === item ? "is-active" : ""}
                  href={`/curator?status=${item}`}
                  key={item}
                >
                  {item} <span>{counts[item]}</span>
                </Link>
              ))}
            </div>
          </div>

          {problems.length > 0 ? (
            <div className="curator-problem-list">
              {problems.map((problem) => (
                <Link className="curator-problem-card" href={`/curator/problems/${problem.id}`} key={problem.id}>
                  <div>
                    <div className="curator-problem-meta">
                      <span className={`curator-status curator-status-${problem.status}`}>{problem.status}</span>
                      {problem.category ? <span>{problem.category}</span> : null}
                    </div>
                    <h3>{problem.title}</h3>
                    <p>{problem.summary}</p>
                  </div>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="curator-empty-state">
              <strong>해당 상태의 Public Problem이 없습니다.</strong>
              <p>새 Draft를 만들면 publication queue에 표시됩니다.</p>
            </div>
          )}
        </div>

        <aside className="curator-side-column">
          <CuratorCreateProblemForm />
        </aside>
      </section>
    </main>
  );
}
