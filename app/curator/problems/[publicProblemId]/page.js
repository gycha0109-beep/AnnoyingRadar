import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import CuratorProblemEditor from "../../../components/curator-problem-editor.js";
import { loadAdminPublicProblemDetail } from "../../../../lib/radar/service.mjs";
import { createServerSupabaseClient } from "../../../../lib/supabase/server.js";
import { createServiceClient } from "../../../../lib/supabase/service.js";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function CuratorProblemPage({ params }) {
  const { publicProblemId } = await params;
  if (!UUID_RE.test(publicProblemId ?? "")) notFound();

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

  const detail = await loadAdminPublicProblemDetail(serviceClient, publicProblemId);
  if (!detail) notFound();

  return (
    <main className="curator-shell">
      <nav className="curator-topbar">
        <div>
          <Link className="curator-brand" href="/curator">Radar Curator</Link>
          <p>{user.email ?? user.id} · {curator.role}</p>
        </div>
        <div className="curator-nav-actions">
          <Link href="/curator">Queue</Link>
          <Link href="/">Public Radar</Link>
          <Link href="/workspace">Workspace</Link>
        </div>
      </nav>

      <CuratorProblemEditor initialDetail={detail} />
    </main>
  );
}
